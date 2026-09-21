import { useState } from "react";
import {
  CLAUDE_MODELS,
  type Answer,
  type ClaudeModel,
  type Engine,
  type Questions,
} from "../../shared/decision";
import { decide, type DecideResult } from "../api";
import { useSandbox } from "../sandbox/SandboxContext";
import { dummyGenericDecide } from "../sandbox/generic";

const SAMPLE_STATE = {
  hero: { name: "ゆうしゃ", hp: 18, maxHp: 80, mp: 12, spells: ["ホイミ(MP3)", "メラ(MP2)"] },
  enemy: { name: "キラーパンサー", hpRatio: "残り3割くらい", nextMove: "痛恨の一撃をためている" },
  items: ["やくそう x1"],
};

const SAMPLE_QUESTIONS: Questions = {
  action: {
    type: "choice",
    instructions: "この状況で勇者が次にとるべき行動は？",
    criteria: {
      attack: "たたかう(通常攻撃)",
      heal: "ホイミで回復",
      fire: "メラで攻撃",
      item: "やくそうを使う",
      flee: "にげる",
    },
  },
  danger: {
    type: "score",
    instructions: "勇者のピンチ度は？",
    criteria: ["余裕", "やや危険", "かなり危険", "瀕死"],
  },
  finish: {
    type: "noul",
    instructions: "次の勇者の攻撃で敵を倒しきれそうか？",
  },
};

type Slot = { status: "idle" | "loading" | "done" | "error"; result?: DecideResult; error?: string };

export function Playground() {
  const [stateText, setStateText] = useState(JSON.stringify(SAMPLE_STATE, null, 2));
  const [questionsText, setQuestionsText] = useState(JSON.stringify(SAMPLE_QUESTIONS, null, 2));
  const [model, setModel] = useState<ClaudeModel>("claude-haiku-4-5");
  const [slots, setSlots] = useState<Record<Engine, Slot>>({
    jev: { status: "idle" },
    claude: { status: "idle" },
  });
  const [parseError, setParseError] = useState<string>();
  const { enabled: sandbox } = useSandbox();

  const run = () => {
    let state: unknown;
    let questions: Questions;
    try {
      state = JSON.parse(stateText);
      questions = JSON.parse(questionsText);
    } catch (e) {
      setParseError(`JSON が読めません: ${(e as Error).message}`);
      return;
    }
    setParseError(undefined);

    // 2つのエンジンを同時に走らせ、先に返った方から表示する
    for (const engine of ["jev", "claude"] as const) {
      setSlots((s) => ({ ...s, [engine]: { status: "loading" } }));
      (sandbox ? dummyGenericDecide : decide)({ engine, model, state, questions })
        .then((result) => setSlots((s) => ({ ...s, [engine]: { status: "done", result } })))
        .catch((e: Error) =>
          setSlots((s) => ({ ...s, [engine]: { status: "error", error: e.message } })),
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Editor label="state(状況)" value={stateText} onChange={setStateText} />
        <Editor label="questions(質問)" value={questionsText} onChange={setQuestionsText} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={run}
          className="rounded bg-amber-400 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-300"
        >
          両方で判断する
        </button>
        <label className="text-sm text-slate-400">
          Claude モデル{" "}
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as ClaudeModel)}
            className="ml-1 rounded bg-slate-900 px-2 py-1 text-slate-100 ring-1 ring-slate-700"
          >
            {CLAUDE_MODELS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        {parseError && <span className="text-sm text-rose-400">{parseError}</span>}
        {sandbox && (
          <span className="text-xs text-emerald-300">
            ダミーモードでは質問の中身を理解せず、文字の重なりで答えを選ぶだけ(応答時間だけ本物に近い)
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ResultPanel title="Jev" accent="text-amber-300" slot={slots.jev} />
        <ResultPanel title="Claude" accent="text-sky-300" slot={slots.claude} />
      </div>
    </div>
  );
}

function Editor(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-slate-400">{props.label}</span>
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        spellCheck={false}
        className="mt-1 h-72 w-full rounded bg-slate-900 p-3 font-mono text-xs outline-none ring-1 ring-slate-800 focus:ring-amber-400"
      />
    </label>
  );
}

function ResultPanel(props: { title: string; accent: string; slot: Slot }) {
  const { slot } = props;
  return (
    <section className="rounded-lg border border-slate-800 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className={`text-lg font-bold ${props.accent}`}>{props.title}</h2>
        {slot.result && (
          <span className="font-mono text-2xl tabular-nums">
            {slot.result.latencyMs}
            <span className="text-sm text-slate-400"> ms</span>
          </span>
        )}
      </div>
      {slot.status === "idle" && <p className="mt-3 text-sm text-slate-500">未実行</p>}
      {slot.status === "loading" && (
        <p className="mt-3 animate-pulse text-sm text-slate-400">かんがえちゅう…</p>
      )}
      {slot.status === "error" && <p className="mt-3 text-sm text-rose-400">{slot.error}</p>}
      {slot.result && (
        <div className="mt-3 space-y-4">
          <p className="text-xs text-slate-500">
            {slot.result.model} ・ 往復 {slot.result.roundTripMs}ms
          </p>
          {Object.entries(slot.result.answers).map(([key, answer]) => (
            <AnswerView key={key} name={key} answer={answer} />
          ))}
        </div>
      )}
    </section>
  );
}

function AnswerView({ name, answer }: { name: string; answer: Answer }) {
  const value =
    answer.type === "choice"
      ? answer.choice
      : answer.type === "score"
        ? answer.score.toFixed(2)
        : answer.noul === 1 || answer.noul === 0
          ? answer.noul === 1 ? "Yes" : "No"
          : `Yes ${(answer.noul * 100).toFixed(0)}%`;
  const probabilities = answer.type === "noul" ? undefined : answer.probabilities;
  const confidence = answer.type === "noul" ? undefined : answer.confidence;

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-slate-400">{name}</span>
        <span className="font-semibold">{value}</span>
        {confidence !== undefined && (
          <span className="text-xs text-slate-500">確信度 {(confidence * 100).toFixed(0)}%</span>
        )}
      </div>
      {probabilities && (
        <div className="mt-1 space-y-1">
          {Object.entries(probabilities)
            .sort(([, a], [, b]) => b - a)
            .map(([label, p]) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 truncate text-slate-400">{label}</span>
                <div className="h-2 flex-1 rounded bg-slate-800">
                  <div className="h-2 rounded bg-amber-400" style={{ width: `${p * 100}%` }} />
                </div>
                <span className="w-10 text-right tabular-nums">{(p * 100).toFixed(0)}%</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
