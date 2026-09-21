// ダミーモードの模擬面接。質問は用意したものから出し、採点はキーワード、講評はひな形で作る
import type { Answer } from "../../shared/decision";
import type { FeedbackResponse, InterviewTheme, QuestionResponse } from "../../shared/interview";
import type { DecideResult } from "../api";
import { QUESTION_BANK, TONES } from "../interview/rubric";
import { dummyLatency, fakeProbabilities, sleep } from "./latency";

export async function dummyQuestion(theme: InterviewTheme, previous: string[]): Promise<QuestionResponse> {
  const latencyMs = dummyLatency("claude", "claude-haiku-4-5");
  await sleep(latencyMs);
  const candidates = QUESTION_BANK[theme].filter((q) => !previous.includes(q));
  const pool = candidates.length > 0 ? candidates : QUESTION_BANK[theme];
  return {
    model: "claude-haiku-4-5(ダミー)",
    question: pool[Math.floor(Math.random() * pool.length)],
    latencyMs,
  };
}

const firstSentence = (text: string) => text.split(/[。！？!?]/)[0] ?? "";

export async function dummyJudge(text: string): Promise<DecideResult> {
  const latencyMs = dummyLatency("jev");
  await sleep(latencyMs);

  const hedges = (text.match(/えっと|たぶん|かな|かもしれ|まあ|というか|わりと/g) ?? []).length;
  const connectors = (text.match(/その結果|なぜなら|理由は|このため|そこで|から、|ので/g) ?? []).length;
  const hasExample = /前職|プロジェクト|例えば|具体的|[0-9０-９]+(件|%|か月|人|倍|回)/.test(text);
  const conclusionFirst = /強み|結論|学び|理由|基準|解決/.test(firstSentence(text)) && hedges === 0;
  const answers = Math.max(0, Math.min(3, 1 + (conclusionFirst ? 1 : 0) + (hasExample ? 1 : 0) - (hedges >= 3 ? 1 : 0)));
  const logic = Math.max(0, Math.min(3, 1 + Math.min(2, connectors) - (hedges >= 3 ? 1 : 0)));
  const tone: keyof typeof TONES = hedges >= 2 ? "unsure" : conclusionFirst ? "confident" : "neutral";
  // 見た目のために少し揺らす(段階の範囲 0〜3 からははみ出さない)
  const wobble = (v: number) => Math.max(0, Math.min(3, v + (Math.random() - 0.5) * 0.3));

  const result: Record<string, Answer> = {
    answers: { type: "score", score: wobble(answers), confidence: 0.7 },
    conclusionFirst: { type: "noul", noul: conclusionFirst ? 0.85 : 0.15 },
    example: { type: "noul", noul: hasExample ? 0.9 : 0.1 },
    logic: { type: "score", score: wobble(logic), confidence: 0.65 },
    tone: { type: "choice", choice: tone, ...fakeProbabilities(tone, Object.keys(TONES) as (keyof typeof TONES)[]) },
  };
  return { engine: "jev", model: "jev(ダミー)", latencyMs, roundTripMs: latencyMs, answers: result };
}

export async function dummyFeedback(scores: string, opusEffort: "low" | "medium" | "high"): Promise<FeedbackResponse> {
  const latencyMs = dummyLatency("claude", "claude-opus-5", opusEffort);
  await sleep(latencyMs);
  const weak = !scores.includes("結論から話している: はい") || !scores.includes("具体例: あり");
  const feedback = weak
    ? [
        "良かった点",
        "自分の考えを言葉にしようとしている姿勢は伝わります。",
        "",
        "改善点",
        "1. 最初の一文で結論(自分の強みは何か)を言い切りましょう。",
        "2. 強みが発揮された具体的な場面や数字を1つ入れると、説得力が大きく上がります。",
        "",
        "書き出し例",
        "「私の強みは、◯◯です。前職で△△に取り組んだ際に……」",
        "",
        "(ダミーモードのため、ひな形の講評です)",
      ].join("\n")
    : [
        "良かった点",
        "結論から話し、具体的な数字で成果を示せているので、強みがはっきり伝わります。",
        "",
        "改善点",
        "1. 学んだことを、入社後にどう活かすかまで一言添えると印象がさらに良くなります。",
        "2. 調査の中で自分が工夫した点を1つに絞って強調すると、話がより締まります。",
        "",
        "書き出し例",
        "「私の強みは、問題の原因を最後まで突き止める粘り強さで、御社でも……」",
        "",
        "(ダミーモードのため、ひな形の講評です)",
      ].join("\n");
  return { model: "claude-opus-5(ダミー)", feedback, latencyMs };
}
