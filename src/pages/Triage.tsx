import { useRef, useState } from "react";
import {
  CLAUDE_EFFORTS,
  type ClaudeEffort,
  type EscalateRequest,
  type EscalateResponse,
} from "../../shared/decision";
import { decide, postJson } from "../api";
import { DEPARTMENTS, URGENCY_LEVELS, type Department } from "../form/questions";
import { dummyEscalate, dummyTriageJudge } from "../sandbox/triage";
import { useSandbox } from "../sandbox/SandboxContext";
import { INQUIRIES, type Inquiry } from "../triage/samples";
import { costUsd, formatUsd, type Usage } from "../triage/pricing";

/** 同時に投げる数。ブラウザと API の両方に優しい範囲 */
const CONCURRENCY = 6;

/** 比較用に一度だけ実測した「全件を Claude Opus に投げた場合」(2026-09-23、同じ30件・同じ並列数) */
const ALL_OPUS_BASELINE = { wallSec: 26.1, usd: 0.1533 };

const TRIAGE_QUESTIONS = {
  department: {
    type: "choice" as const,
    instructions: "この問い合わせを担当すべき部署は？",
    criteria: Object.fromEntries(Object.entries(DEPARTMENTS).map(([k, d]) => [k, d.description])),
  },
  urgency: {
    type: "score" as const,
    instructions: "この問い合わせの緊急度は？",
    criteria: [...URGENCY_LEVELS] as [string, string, ...string[]],
  },
};

type RowStatus = "pending" | "judging" | "auto" | "needs-escalation" | "escalating" | "escalated" | "error";

interface Row {
  inquiry: Inquiry;
  status: RowStatus;
  jev?: { department: Department; confidence: number; urgency: number; latencyMs: number; usage?: Usage };
  claude?: { department: Department; urgency: number; reason: string; latencyMs: number; usage: Usage; model: string };
  error?: string;
}

interface Phase {
  running: boolean;
  wallMs: number;
  calls: number;
  costUsd: number;
}

const emptyPhase: Phase = { running: false, wallMs: 0, calls: 0, costUsd: 0 };

/** 並列数を絞って全件を処理する */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await worker(items[i]);
      }
    }),
  );
}

export function Triage() {
  const { enabled: sandbox } = useSandbox();
  const [threshold, setThreshold] = useState(0.6);
  const [effort, setEffort] = useState<ClaudeEffort>("low");
  const [rows, setRows] = useState<Row[]>(() => INQUIRIES.map((inquiry) => ({ inquiry, status: "pending" })));
  const [jevPhase, setJevPhase] = useState<Phase>(emptyPhase);
  const [claudePhase, setClaudePhase] = useState<Phase>(emptyPhase);
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;

  const update = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.inquiry.id === id ? { ...r, ...patch } : r)));

  const reset = () => {
    setRows(INQUIRIES.map((inquiry) => ({ inquiry, status: "pending" })));
    setJevPhase(emptyPhase);
    setClaudePhase(emptyPhase);
  };

  /** 層1: Jev が全件を一次受けする */
  const runFirstPass = async () => {
    reset();
    setJevPhase({ ...emptyPhase, running: true });
    const started = performance.now();
    let calls = 0;
    let cost = 0;

    await runPool(INQUIRIES, CONCURRENCY, async (inquiry) => {
      update(inquiry.id, { status: "judging" });
      try {
        const res = sandbox
          ? await dummyTriageJudge(inquiry.text)
          : await decide({ engine: "jev", state: { 問い合わせ本文: inquiry.text }, questions: TRIAGE_QUESTIONS });
        const dep = res.answers.department;
        const urg = res.answers.urgency;
        if (dep?.type !== "choice" || urg?.type !== "score") throw new Error("回答の形式が想定と違います");
        // 確信度を返すのは Jev だけ。無ければ「迷っていない」として扱う
        const confidence = dep.confidence ?? 1;
        calls += 1;
        cost += costUsd(res.model, res.usage);
        update(inquiry.id, {
          status: confidence >= thresholdRef.current ? "auto" : "needs-escalation",
          jev: {
            department: dep.choice as Department,
            confidence,
            urgency: urg.score,
            latencyMs: res.latencyMs,
            usage: res.usage,
          },
        });
      } catch (e) {
        update(inquiry.id, { status: "error", error: (e as Error).message });
      }
    });

    setJevPhase({ running: false, wallMs: Math.round(performance.now() - started), calls, costUsd: cost });
  };

  /** 層2: Jev が迷った件だけを Claude に回す */
  const runEscalation = async () => {
    const targets = rows.filter((r) => r.status === "needs-escalation").map((r) => r.inquiry);
    if (targets.length === 0) return;
    setClaudePhase({ ...emptyPhase, running: true });
    const started = performance.now();
    let calls = 0;
    let cost = 0;

    await runPool(targets, CONCURRENCY, async (inquiry) => {
      update(inquiry.id, { status: "escalating" });
      try {
        const departments = Object.fromEntries(Object.entries(DEPARTMENTS).map(([k, d]) => [k, d.description]));
        const res = sandbox
          ? await dummyEscalate(inquiry.text, effort)
          : await postJson<EscalateResponse>("/api/triage/escalate", {
              model: "claude-opus-5",
              effort,
              text: inquiry.text,
              departments,
            } satisfies EscalateRequest);
        calls += 1;
        cost += costUsd(res.model, res.usage);
        update(inquiry.id, {
          status: "escalated",
          claude: {
            department: res.department as Department,
            urgency: res.urgency,
            reason: res.reason,
            latencyMs: res.latencyMs,
            usage: res.usage,
            model: res.model,
          },
        });
      } catch (e) {
        update(inquiry.id, { status: "error", error: (e as Error).message });
      }
    });

    setClaudePhase({ running: false, wallMs: Math.round(performance.now() - started), calls, costUsd: cost });
  };

  const counts = {
    done: rows.filter((r) => r.jev).length,
    auto: rows.filter((r) => r.status === "auto").length,
    needs: rows.filter((r) => r.status === "needs-escalation").length,
    escalated: rows.filter((r) => r.status === "escalated").length,
    error: rows.filter((r) => r.status === "error").length,
  };
  const busy = jevPhase.running || claudePhase.running;
  const escalationRate = counts.done > 0 ? ((counts.needs + counts.escalated) / counts.done) * 100 : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">問い合わせの一次仕分け</h1>
        <p className="mt-1 text-sm text-slate-400">
          <span className="text-amber-300">Jev</span> が {INQUIRIES.length} 件すべてを一次受けし、
          <b>確信度が低い件だけ</b> <span className="text-violet-300">Claude Opus</span> に上げる。対応の階層を分ける例。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <button
          onClick={runFirstPass}
          disabled={busy}
          className="rounded bg-amber-400 px-4 py-1.5 font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-40"
        >
          {jevPhase.running ? "一次受け中…" : `Jev で一次受け(${INQUIRIES.length}件)`}
        </button>
        <button
          onClick={runEscalation}
          disabled={busy || counts.needs === 0}
          className="rounded bg-violet-400 px-4 py-1.5 font-semibold text-slate-950 hover:bg-violet-300 disabled:opacity-40"
        >
          {claudePhase.running ? "Claude が確認中…" : `迷った ${counts.needs} 件を Claude に回す`}
        </button>
        <label className="flex items-center gap-2 text-slate-400">
          エスカレーションのしきい値
          <input
            type="range"
            min={0.3}
            max={0.9}
            step={0.05}
            value={threshold}
            disabled={busy}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
          <span className="w-12 tabular-nums text-slate-200">{threshold.toFixed(2)}</span>
        </label>
        <label className="text-slate-400">
          Opus の effort{" "}
          <select
            value={effort}
            disabled={busy}
            onChange={(e) => setEffort(e.target.value as ClaudeEffort)}
            className="ml-1 rounded bg-slate-900 px-2 py-1 text-slate-100 ring-1 ring-slate-700"
          >
            {CLAUDE_EFFORTS.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        {counts.done > 0 && !busy && (
          <button onClick={reset} className="rounded px-3 py-1.5 text-slate-400 ring-1 ring-slate-700 hover:text-slate-200">
            リセット
          </button>
        )}
      </div>

      {/* 集計 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Summary
          title="層1: Jev(一次受け)"
          accent="text-amber-300"
          rows={[
            ["処理した件数", `${jevPhase.calls} 件`],
            ["かかった時間", jevPhase.wallMs ? `${(jevPhase.wallMs / 1000).toFixed(1)} 秒` : "—"],
            ["料金の概算", jevPhase.calls ? formatUsd(jevPhase.costUsd) : "—"],
          ]}
        />
        <Summary
          title="層2: Claude Opus(エスカレーション)"
          accent="text-violet-300"
          rows={[
            ["上げた件数", counts.done ? `${counts.needs + counts.escalated} 件(${escalationRate.toFixed(0)}%)` : "—"],
            ["かかった時間", claudePhase.wallMs ? `${(claudePhase.wallMs / 1000).toFixed(1)} 秒` : "—"],
            ["料金の概算", claudePhase.calls ? formatUsd(claudePhase.costUsd) : "—"],
          ]}
        />
        <Summary
          title="合計"
          accent="text-slate-200"
          rows={[
            ["自動で流せた件数", counts.done ? `${counts.auto} 件` : "—"],
            ["合計時間", jevPhase.wallMs ? `${((jevPhase.wallMs + claudePhase.wallMs) / 1000).toFixed(1)} 秒` : "—"],
            ["合計の料金", jevPhase.calls ? formatUsd(jevPhase.costUsd + claudePhase.costUsd) : "—"],
          ]}
        />
      </div>

      <section className="rounded-xl bg-slate-900/40 p-4 ring-1 ring-slate-800">
        <h2 className="text-sm font-bold text-slate-300">参考: 一次受けを挟まず、全件を Claude Opus に投げた場合(実測)</h2>
        <div className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <span className="text-slate-400">
            時間 <b className="ml-1 tabular-nums text-slate-100">{ALL_OPUS_BASELINE.wallSec} 秒</b>
          </span>
          <span className="text-slate-400">
            料金 <b className="ml-1 tabular-nums text-slate-100">{formatUsd(ALL_OPUS_BASELINE.usd)}</b>
          </span>
          {jevPhase.calls > 0 && !busy && (
            <span className="text-emerald-300">
              → 階層にすると 時間 約
              {(ALL_OPUS_BASELINE.wallSec / ((jevPhase.wallMs + claudePhase.wallMs) / 1000)).toFixed(1)}分の1、 料金 約
              {(ALL_OPUS_BASELINE.usd / (jevPhase.costUsd + claudePhase.costUsd)).toFixed(0)}分の1
            </span>
          )}
        </div>
      </section>

      {/* 一覧 */}
      <div className="overflow-hidden rounded-xl ring-1 ring-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">問い合わせ</th>
              <th className="px-3 py-2 text-left">Jev の判定</th>
              <th className="px-3 py-2 text-left">確信度</th>
              <th className="px-3 py-2 text-left">行き先</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <TableRow key={r.inquiry.id} row={r} />
            ))}
          </tbody>
        </table>
      </div>
      {counts.error > 0 && <p className="text-sm text-rose-400">{counts.error} 件でエラーが出ました</p>}
    </div>
  );
}

function Summary(props: { title: string; accent: string; rows: [string, string][] }) {
  return (
    <section className="rounded-xl bg-slate-900/60 p-4 ring-1 ring-slate-800">
      <h2 className={`text-sm font-bold ${props.accent}`}>{props.title}</h2>
      <dl className="mt-2 space-y-1 text-sm">
        {props.rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-slate-400">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TableRow({ row }: { row: Row }) {
  const { inquiry, jev, claude, status } = row;
  return (
    <tr className={`border-t border-slate-800 ${status === "judging" || status === "escalating" ? "animate-pulse" : ""}`}>
      <td className="px-3 py-2 font-mono text-xs text-slate-500">{inquiry.id}</td>
      <td className="max-w-md truncate px-3 py-2" title={inquiry.text}>
        {inquiry.text}
      </td>
      <td className="px-3 py-2">
        {jev ? (
          <>
            {DEPARTMENTS[jev.department]?.label ?? jev.department}
            <span className="ml-2 text-xs text-slate-500">{URGENCY_LEVELS[Math.round(jev.urgency)]}</span>
          </>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {jev && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 rounded bg-slate-800">
              <div
                className={`h-1.5 rounded ${jev.confidence >= 0.6 ? "bg-emerald-400" : "bg-rose-400"}`}
                style={{ width: `${jev.confidence * 100}%` }}
              />
            </div>
            <span className="font-mono text-xs tabular-nums">{(jev.confidence * 100).toFixed(0)}%</span>
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        {status === "pending" && <span className="text-slate-600">待機</span>}
        {status === "judging" && <span className="text-slate-400">判定中…</span>}
        {status === "auto" && <span className="text-emerald-300">自動で振り分け</span>}
        {status === "needs-escalation" && <span className="text-amber-300">要エスカレーション</span>}
        {status === "escalating" && <span className="text-violet-300">Claude が確認中…</span>}
        {status === "escalated" && claude && (
          <span className="text-violet-200">
            → {DEPARTMENTS[claude.department]?.label ?? claude.department}
            <span className="ml-2 text-xs text-slate-400">{claude.reason}</span>
          </span>
        )}
        {status === "error" && <span className="text-rose-400">{row.error}</span>}
      </td>
    </tr>
  );
}
