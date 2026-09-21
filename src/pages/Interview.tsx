import { useEffect, useRef, useState } from "react";
import { CLAUDE_EFFORTS, type Answer, type ClaudeEffort } from "../../shared/decision";
import {
  INTERVIEW_THEMES,
  type FeedbackRequest,
  type FeedbackResponse,
  type InterviewTheme,
  type QuestionRequest,
  type QuestionResponse,
} from "../../shared/interview";
import { postJson } from "../api";
import {
  ANSWERS_LEVELS,
  LOGIC_LEVELS,
  RUBRIC,
  SAMPLE_ANSWERS,
  TONES,
  describeScores,
  lengthFeedback,
} from "../interview/rubric";
import { useLiveDecision, type LiveJudgeSpec } from "../live/useLiveDecision";
import { useSandbox } from "../sandbox/SandboxContext";
import { dummyFeedback, dummyJudge, dummyQuestion } from "../sandbox/interview";

const TYPING_INTERVAL_MS = 40;

const INTERVIEW_SPEC: LiveJudgeSpec = {
  questions: RUBRIC,
  toState: (text, question) => ({ 面接官の質問: question, 候補者の回答: text }),
  dummy: (_slot, text) => dummyJudge(text),
  minChars: 10,
};

type Async<T> = { status: "idle" } | { status: "loading" } | { status: "done"; value: T } | { status: "error"; error: string };

export function Interview() {
  const { enabled: sandbox } = useSandbox();
  const [theme, setTheme] = useState<InterviewTheme>("strength");
  const [question, setQuestion] = useState<Async<QuestionResponse>>({ status: "idle" });
  const [asked, setAsked] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [effort, setEffort] = useState<ClaudeEffort>("low");
  const [feedback, setFeedback] = useState<Async<FeedbackResponse>>({ status: "idle" });
  const typingTimer = useRef<number | null>(null);

  const questionText = question.status === "done" ? question.value.question : "";
  // 回答中は Jev だけが採点し続ける(何十回判定しても速くて安い)
  const jev = useLiveDecision("jev", answer, {
    spec: INTERVIEW_SPEC,
    effort: "low",
    sandbox,
    context: questionText,
  });

  const stopTyping = () => {
    if (typingTimer.current !== null) clearInterval(typingTimer.current);
    typingTimer.current = null;
  };
  useEffect(() => stopTyping, []);

  const askQuestion = async () => {
    stopTyping();
    setQuestion({ status: "loading" });
    setAnswer("");
    setFeedback({ status: "idle" });
    jev.reset();
    try {
      const value = sandbox
        ? await dummyQuestion(theme, asked)
        : await postJson<QuestionResponse>("/api/interview/question", { theme, previous: asked } satisfies QuestionRequest);
      setQuestion({ status: "done", value });
      setAsked((a) => [...a, value.question]);
    } catch (e) {
      setQuestion({ status: "error", error: (e as Error).message });
    }
  };

  const playSample = (text: string) => {
    stopTyping();
    setFeedback({ status: "idle" });
    setAnswer("");
    let i = 0;
    typingTimer.current = window.setInterval(() => {
      i += 1;
      setAnswer(text.slice(0, i));
      if (i >= text.length) stopTyping();
    }, TYPING_INTERVAL_MS);
  };

  const submit = async () => {
    stopTyping();
    setFeedback({ status: "loading" });
    const scores = describeScores(jev.answers, answer);
    try {
      const value = sandbox
        ? await dummyFeedback(scores, effort)
        : await postJson<FeedbackResponse>("/api/interview/feedback", {
            model: "claude-opus-5",
            effort,
            question: questionText,
            answer,
            scores,
          } satisfies FeedbackRequest);
      setFeedback({ status: "done", value });
    } catch (e) {
      setFeedback({ status: "error", error: (e as Error).message });
    }
  };

  const length = lengthFeedback(answer);
  const avg = jev.count > 0 ? Math.round(jev.totalLatencyMs / jev.count) : null;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold tracking-widest text-amber-300">APPENDIX</p>
        <h1 className="text-xl font-bold">模擬面接 — AI の使い分け(カスケード)</h1>
        <p className="mt-1 text-sm text-slate-400">
          質問は <span className="text-sky-300">Claude Haiku</span> が作り、回答中は{" "}
          <span className="text-amber-300">Jev</span> が何度でも即採点し、提出したときだけ{" "}
          <span className="text-violet-300">Claude Opus</span> が講評を書く。
        </p>
      </div>

      {/* 質問 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-sm">
        <label className="text-slate-400">
          テーマ{" "}
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as InterviewTheme)}
            className="ml-1 rounded bg-slate-900 px-2 py-1 text-slate-100 ring-1 ring-slate-700"
          >
            {(Object.keys(INTERVIEW_THEMES) as InterviewTheme[]).map((t) => (
              <option key={t} value={t}>
                {INTERVIEW_THEMES[t].label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={askQuestion}
          disabled={question.status === "loading"}
          className="rounded bg-sky-400 px-4 py-1.5 font-semibold text-slate-950 hover:bg-sky-300 disabled:opacity-50"
        >
          {question.status === "done" ? "別の質問をもらう" : "質問をもらう"}
        </button>
      </div>

      <section className="rounded-xl bg-slate-900/60 p-4 ring-1 ring-slate-800">
        <div className="flex items-baseline justify-between text-xs text-slate-500">
          <span className="text-sky-300">面接官(Claude Haiku)</span>
          {question.status === "done" && (
            <span>
              {question.value.model} ・ {question.value.latencyMs}ms
            </span>
          )}
        </div>
        <p className="mt-2 min-h-7 text-lg">
          {question.status === "idle" && <span className="text-slate-500">「質問をもらう」を押してください</span>}
          {question.status === "loading" && <span className="animate-pulse text-slate-400">質問を考えています…</span>}
          {question.status === "error" && <span className="text-sm text-rose-400">{question.error}</span>}
          {question.status === "done" && question.value.question}
        </p>
      </section>

      {question.status === "done" && (
        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          {/* 回答 */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-400">自動入力</span>
              {SAMPLE_ANSWERS.map((s) => (
                <button
                  key={s.title}
                  onClick={() => playSample(s.text)}
                  className="rounded px-2.5 py-1 ring-1 ring-slate-700 hover:ring-amber-400"
                >
                  {s.title}
                </button>
              ))}
              <span className="text-xs text-slate-500">(サンプルは「強み」の質問向け)</span>
            </div>
            <textarea
              value={answer}
              onChange={(e) => {
                stopTyping();
                setFeedback({ status: "idle" });
                setAnswer(e.target.value);
              }}
              placeholder="回答を入力(1分で話すつもりで、300字前後)"
              className="h-56 w-full rounded bg-slate-950 p-3 text-sm leading-relaxed outline-none ring-1 ring-slate-700 focus:ring-amber-400"
            />
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className={length.ok ? "text-emerald-300" : "text-slate-400"}>文字数: {length.label}</span>
              <span className="text-xs text-slate-500">(文字数は計算なので Jev ではなくコードで見ている)</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button
                onClick={submit}
                disabled={answer.trim().length < 10 || feedback.status === "loading"}
                className="rounded bg-violet-400 px-4 py-2 font-semibold text-slate-950 hover:bg-violet-300 disabled:opacity-40"
              >
                提出して講評をもらう
              </button>
              <label className="text-slate-400">
                Opus の effort{" "}
                <select
                  value={effort}
                  onChange={(e) => setEffort(e.target.value as ClaudeEffort)}
                  className="ml-1 rounded bg-slate-900 px-2 py-1 text-slate-100 ring-1 ring-slate-700"
                >
                  {CLAUDE_EFFORTS.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Jev の採点 */}
          <section className="rounded-xl bg-slate-900 p-4 ring-1 ring-amber-400/40">
            <header className="flex items-baseline justify-between">
              <h2 className="font-bold text-amber-300">Jev の即時採点</h2>
              <span className="font-mono text-lg tabular-nums">
                {jev.latencyMs ?? "—"}
                <span className="text-xs text-slate-400">ms</span>
              </span>
            </header>
            <p className="mt-1 h-5 text-xs">
              {jev.forText === undefined ? (
                <span className="text-slate-500">回答を待っています</span>
              ) : jev.forText === answer ? (
                <span className="text-emerald-300">最新の回答に追いついている</span>
              ) : (
                <span className="text-rose-300">
                  {answer.startsWith(jev.forText) ? `${answer.length - jev.forText.length}文字前の回答に対する採点` : "古い回答に対する採点"}
                </span>
              )}
              {jev.pendingSince !== null && <span className="ml-2 animate-pulse text-slate-400">採点中…</span>}
            </p>
            {jev.answers ? <Scores answers={jev.answers} /> : <div className="h-48" />}
            {jev.error && <p className="mt-2 text-xs text-rose-400">{jev.error}</p>}
            <footer className="mt-3 flex justify-between text-xs text-slate-500">
              <span>採点回数 {jev.count}</span>
              <span>平均 {avg ?? "—"}ms</span>
            </footer>
          </section>
        </div>
      )}

      {feedback.status !== "idle" && (
        <section className="rounded-xl bg-slate-900/60 p-4 ring-1 ring-violet-400/40">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold text-violet-300">講評(Claude Opus / {effort})</h2>
            {feedback.status === "done" && (
              <span className="text-xs text-slate-500">
                {feedback.value.model} ・ {feedback.value.latencyMs.toLocaleString()}ms
              </span>
            )}
          </div>
          {feedback.status === "loading" && <p className="mt-2 animate-pulse text-sm text-slate-400">講評を書いています…</p>}
          {feedback.status === "error" && <p className="mt-2 text-sm text-rose-400">{feedback.error}</p>}
          {feedback.status === "done" && (
            <>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{feedback.value.feedback}</p>
              <p className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-400">
                この1問で: <span className="text-amber-300">Jev</span> が {jev.count}回採点(平均 {avg ?? "—"}ms)、
                <span className="text-sky-300"> Haiku</span> が質問を1回、
                <span className="text-violet-300"> Opus</span> が講評を1回。重い処理は最後の1回だけ。
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Scores({ answers }: { answers: Record<string, Answer> }) {
  const a = answers.answers;
  const c = answers.conclusionFirst;
  const e = answers.example;
  const l = answers.logic;
  const t = answers.tone;
  return (
    <dl className="mt-3 space-y-3 text-sm">
      {a?.type === "score" && <Level label="質問に答えているか" score={a.score} levels={ANSWERS_LEVELS} />}
      {l?.type === "score" && <Level label="論理性" score={l.score} levels={LOGIC_LEVELS} />}
      {c?.type === "noul" && <YesNo label="結論から話している" p={c.noul} />}
      {e?.type === "noul" && <YesNo label="具体例がある" p={e.noul} />}
      {t?.type === "choice" && (
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-400">話し方</dt>
          <dd className="text-right">
            {TONES[t.choice as keyof typeof TONES] ?? t.choice}
            {t.confidence !== undefined && (
              <span className="ml-2 text-xs text-slate-500">確信度 {(t.confidence * 100).toFixed(0)}%</span>
            )}
          </dd>
        </div>
      )}
    </dl>
  );
}

function Level({ label, score, levels }: { label: string; score: number; levels: readonly string[] }) {
  const max = levels.length - 1;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-slate-400">{label}</dt>
        <dd>
          {levels[Math.max(0, Math.min(max, Math.round(score)))]}
          <span className="ml-2 font-mono text-xs text-slate-500">{score.toFixed(2)}</span>
        </dd>
      </div>
      <div className="mt-1 h-1.5 rounded bg-slate-800">
        <div className="h-1.5 rounded bg-amber-400 transition-all" style={{ width: `${(score / max) * 100}%` }} />
      </div>
    </div>
  );
}

function YesNo({ label, p }: { label: string; p: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-slate-400">{label}</dt>
        <dd className={p >= 0.5 ? "text-emerald-300" : "text-rose-300"}>
          {p >= 0.5 ? "はい" : "いいえ"}
          <span className="ml-2 font-mono text-xs text-slate-500">{(p * 100).toFixed(0)}%</span>
        </dd>
      </div>
      <div className="mt-1 h-1.5 rounded bg-slate-800">
        <div className="h-1.5 rounded bg-amber-400 transition-all" style={{ width: `${p * 100}%` }} />
      </div>
    </div>
  );
}
