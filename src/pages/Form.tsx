import { useEffect, useRef, useState } from "react";
import { CLAUDE_EFFORTS, type Answer, type ClaudeEffort } from "../../shared/decision";
import { DEPARTMENTS, SAMPLES, URGENCY_LEVELS, type Department } from "../form/questions";
import { useLiveDecision, type LiveDecision } from "../form/useLiveDecision";
import { useSandbox } from "../sandbox/SandboxContext";
import { SLOT_IDS, SLOTS, type SlotId } from "../slots";

const ACCENTS: Record<SlotId, string> = {
  jev: "text-amber-300",
  haiku: "text-sky-300",
  opus: "text-violet-300",
};

const TYPING_INTERVAL_MS = 60;

export function Form() {
  const [text, setText] = useState("");
  // 入力中の判定なので、Opus も既定は速さ優先の low
  const [opusEffort, setOpusEffort] = useState<ClaudeEffort>("low");
  const [driver, setDriver] = useState<SlotId>("jev");
  const { enabled: sandbox } = useSandbox();
  const [submitted, setSubmitted] = useState(false);
  const typingTimer = useRef<number | null>(null);

  const decisions: Record<SlotId, ReturnType<typeof useLiveDecision>> = {
    jev: useLiveDecision("jev", text, { effort: "low", sandbox }),
    haiku: useLiveDecision("haiku", text, { effort: "low", sandbox }),
    opus: useLiveDecision("opus", text, { effort: opusEffort, sandbox }),
  };
  const drive = decisions[driver];

  const stopTyping = () => {
    if (typingTimer.current !== null) clearInterval(typingTimer.current);
    typingTimer.current = null;
  };
  useEffect(() => stopTyping, []);

  const playSample = (sample: string) => {
    stopTyping();
    setSubmitted(false);
    setText("");
    SLOT_IDS.forEach((id) => decisions[id].reset());
    let i = 0;
    typingTimer.current = window.setInterval(() => {
      i += 1;
      setText(sample.slice(0, i));
      if (i >= sample.length) stopTyping();
    }, TYPING_INTERVAL_MS);
  };

  const view = toFormView(drive.answers);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">お問い合わせ</h1>
        <p className="mt-1 text-sm text-slate-400">
          入力している最中に、担当部署・緊急度・返金の依頼か・怒っているかを判定し、フォームがその場で変わる。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400">自動入力</span>
          {SAMPLES.map((s) => (
            <button
              key={s.title}
              onClick={() => playSample(s.text)}
              className="rounded px-2.5 py-1 ring-1 ring-slate-700 hover:ring-amber-400"
            >
              {s.title}
            </button>
          ))}
        </div>
        <label className="text-slate-400">
          フォームを動かす判定{" "}
          <select
            value={driver}
            onChange={(e) => setDriver(e.target.value as SlotId)}
            className="ml-1 rounded bg-slate-900 px-2 py-1 text-slate-100 ring-1 ring-slate-700"
          >
            {SLOT_IDS.map((id) => (
              <option key={id} value={id}>
                {SLOTS[id].label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-slate-400">
          Opus の effort{" "}
          <select
            value={opusEffort}
            onChange={(e) => setOpusEffort(e.target.value as ClaudeEffort)}
            className="ml-1 rounded bg-slate-900 px-2 py-1 text-slate-100 ring-1 ring-slate-700"
          >
            {CLAUDE_EFFORTS.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        {/* フォーム本体 */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
          className="space-y-4 rounded-xl bg-slate-900/60 p-5 ring-1 ring-slate-800"
        >
          <label className="block">
            <span className="text-sm text-slate-400">お問い合わせ内容</span>
            <textarea
              value={text}
              onChange={(e) => {
                stopTyping();
                setSubmitted(false);
                setText(e.target.value);
              }}
              placeholder="例: 先月の請求が二重になっています…"
              className="mt-1 h-36 w-full rounded bg-slate-950 p-3 text-sm outline-none ring-1 ring-slate-700 focus:ring-amber-400"
            />
          </label>

          {view && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded bg-slate-800 px-2 py-1">
                担当: <b>{DEPARTMENTS[view.department].label}</b>
              </span>
              <span className={`rounded px-2 py-1 ${view.urgent ? "bg-rose-500/20 text-rose-300" : "bg-slate-800"}`}>
                緊急度: <b>{URGENCY_LEVELS[view.urgencyLevel]}</b>
              </span>
              <span className="text-xs text-slate-500">({SLOTS[driver].label} の判定)</span>
            </div>
          )}

          {/* 判定に応じて出てくる欄 */}
          {view?.refund && (
            <Field label="注文番号(返金の手続きに必要です)" placeholder="例: A-123456" />
          )}
          {view?.department === "technical" && (
            <Field label="エラーコード・ご利用環境" placeholder="例: E-401 / iPhone 15, iOS 20" />
          )}
          {view?.department === "shipping" && (
            <Field label="注文日・配送先の郵便番号" placeholder="例: 9/18, 150-0001" />
          )}
          {view?.urgent && (
            <div className="rounded-lg bg-rose-500/10 p-3 text-sm ring-1 ring-rose-500/40">
              <p className="font-semibold text-rose-300">優先対応の窓口におつなぎします</p>
              {view.angry && (
                <p className="mt-1 text-rose-200/80">
                  ご不便をおかけして申し訳ありません。担当者から直接ご連絡します。
                </p>
              )}
              <div className="mt-2">
                <Field label="折り返しのお電話番号" placeholder="例: 090-0000-0000" />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={text.trim().length === 0}
            className="rounded bg-amber-400 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-40"
          >
            送信する
          </button>
          {submitted && view && (
            <p className="text-sm text-emerald-300">
              (デモ){DEPARTMENTS[view.department].label}の
              {view.urgent ? "優先" : "通常"}キューに振り分けました。実際には送信されません。
            </p>
          )}
        </form>

        {/* 判定の比較 */}
        <div className="space-y-4">
          {SLOT_IDS.map((id) => (
            <DecisionPanel
              key={id}
              title={id === "opus" ? `${SLOTS[id].label} / ${opusEffort}` : SLOTS[id].label}
              accent={ACCENTS[id]}
              decision={decisions[id]}
              text={text}
              active={driver === id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block animate-[fadeIn_0.3s_ease-out]">
      <span className="text-sm text-slate-400">{label}</span>
      <input
        placeholder={placeholder}
        className="mt-1 w-full rounded bg-slate-950 px-3 py-2 text-sm outline-none ring-1 ring-slate-700 focus:ring-amber-400"
      />
    </label>
  );
}

interface FormView {
  department: Department;
  urgencyLevel: number;
  urgent: boolean;
  refund: boolean;
  angry: boolean;
}

/** 判定をフォームの出し分けに使う形へ変換する。しきい値はここで決める */
function toFormView(answers?: Record<string, Answer>): FormView | null {
  const dep = answers?.department;
  const urg = answers?.urgency;
  const refund = answers?.refund;
  const angry = answers?.angry;
  if (dep?.type !== "choice" || urg?.type !== "score" || refund?.type !== "noul" || angry?.type !== "noul") {
    return null;
  }
  const urgencyLevel = Math.min(URGENCY_LEVELS.length - 1, Math.max(0, Math.round(urg.score)));
  return {
    department: dep.choice as Department,
    urgencyLevel,
    urgent: urg.score >= 2 || angry.noul >= 0.7,
    refund: refund.noul >= 0.5,
    angry: angry.noul >= 0.5,
  };
}

function DecisionPanel(props: {
  title: string;
  accent: string;
  decision: LiveDecision;
  text: string;
  active: boolean;
}) {
  const { decision, text } = props;
  const view = toFormView(decision.answers);
  const avg = decision.count > 0 ? Math.round(decision.totalLatencyMs / decision.count) : null;

  return (
    <section
      className={`rounded-xl p-4 ring-1 ${props.active ? "bg-slate-900 ring-amber-400/60" : "bg-slate-900/60 ring-slate-800"}`}
    >
      <header className="flex items-baseline justify-between">
        <h2 className={`font-bold ${props.accent}`}>
          {props.title}
          {props.active && <span className="ml-2 text-xs text-slate-400">フォームを操作中</span>}
        </h2>
        <span className="font-mono text-lg tabular-nums">
          {decision.latencyMs ?? "—"}
          <span className="text-xs text-slate-400">ms</span>
        </span>
      </header>

      <Freshness decision={decision} text={text} />

      {view && decision.answers ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-slate-400">担当部署</dt>
          <dd>
            {DEPARTMENTS[view.department].label}
            <Confidence answer={decision.answers.department} />
          </dd>
          <dt className="text-slate-400">緊急度</dt>
          <dd>
            {URGENCY_LEVELS[view.urgencyLevel]}
            {decision.answers.urgency?.type === "score" && decision.answers.urgency.confidence !== undefined && (
              <span className="ml-2 text-xs text-slate-500">
                スコア {decision.answers.urgency.score.toFixed(2)}
              </span>
            )}
          </dd>
          <dt className="text-slate-400">返金の依頼</dt>
          <dd>
            <Noul answer={decision.answers.refund} />
          </dd>
          <dt className="text-slate-400">怒っている</dt>
          <dd>
            <Noul answer={decision.answers.angry} />
          </dd>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-slate-500">入力を待っています</p>
      )}

      {decision.error && <p className="mt-2 text-xs text-rose-400">{decision.error}</p>}
      <footer className="mt-3 flex justify-between text-xs text-slate-500">
        <span>判定回数 {decision.count}</span>
        <span>平均 {avg ?? "—"}ms</span>
      </footer>
    </section>
  );
}

/** 判定が今の入力に追いついているか */
function Freshness({ decision, text }: { decision: LiveDecision; text: string }) {
  if (decision.forText === undefined) return <div className="mt-1 h-5" />;
  const upToDate = decision.forText === text;
  const behind = text.startsWith(decision.forText) ? text.length - decision.forText.length : null;
  return (
    <div className="mt-1 flex h-5 items-center gap-2 text-xs">
      {upToDate ? (
        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300">最新の入力に追いついている</span>
      ) : (
        <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300">
          {behind !== null ? `${behind}文字前の入力に対する判定` : "古い入力に対する判定"}
        </span>
      )}
      {decision.pendingSince !== null && <span className="animate-pulse text-slate-400">判定中…</span>}
    </div>
  );
}

function Confidence({ answer }: { answer?: Answer }) {
  if (answer?.type !== "choice" || answer.confidence === undefined) return null;
  return <span className="ml-2 text-xs text-slate-500">確信度 {(answer.confidence * 100).toFixed(0)}%</span>;
}

function Noul({ answer }: { answer?: Answer }) {
  if (answer?.type !== "noul") return null;
  const p = answer.noul;
  // Claude は 0 か 1 しか返さないので、そのときは Yes / No だけ出す
  if (p === 0 || p === 1) return <span>{p === 1 ? "はい" : "いいえ"}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      {p >= 0.5 ? "はい" : "いいえ"}
      <span className="inline-block h-1.5 w-20 rounded bg-slate-800 align-middle">
        <span className="block h-1.5 rounded bg-amber-400" style={{ width: `${p * 100}%` }} />
      </span>
      <span className="text-xs tabular-nums text-slate-500">{(p * 100).toFixed(0)}%</span>
    </span>
  );
}
