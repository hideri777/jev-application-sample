// 模擬面接用の Claude 呼び出し。Jev は文章を書けないので、質問づくりと講評は Claude が担当する
import Anthropic from "@anthropic-ai/sdk";
import type { ClaudeEffort, ClaudeModel } from "../shared/decision";
import type { InterviewTheme } from "../shared/interview";
import { INTERVIEW_THEMES } from "../shared/interview";

function textOf(response: Anthropic.Message): string {
  if (response.stop_reason === "refusal") throw new Error("Claude が回答を拒否しました");
  if (response.stop_reason === "max_tokens") throw new Error("Claude の応答が max_tokens で打ち切られました");
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("Claude の応答にテキストがありません");
  return text;
}

const effortFor = (model: ClaudeModel, effort: ClaudeEffort) =>
  model === "claude-haiku-4-5" ? {} : { output_config: { effort } };

export async function generateQuestion(
  apiKey: string,
  model: ClaudeModel,
  theme: InterviewTheme,
  previous: string[],
) {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    ...effortFor(model, "low"),
    system:
      "あなたは日本の IT 企業の面接官です。候補者に投げる質問を1つだけ作ります。質問文だけを1〜2文で出力してください。前置きや番号は不要です。",
    messages: [
      {
        role: "user",
        content: `テーマ: ${INTERVIEW_THEMES[theme].label}(${INTERVIEW_THEMES[theme].description})${
          previous.length > 0 ? `\nすでにした質問(重複を避ける): ${previous.join(" / ")}` : ""
        }`,
      },
    ],
  });
  return { model: response.model, question: textOf(response) };
}

export async function generateFeedback(
  apiKey: string,
  model: ClaudeModel,
  effort: ClaudeEffort,
  question: string,
  answer: string,
  scores: string,
) {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    ...effortFor(model, effort),
    system:
      "あなたは面接の講評をするキャリアアドバイザーです。候補者の回答に対して、良かった点を1つ、改善点を2つまで、改善した回答の書き出し例を1つ、合計250字程度の日本語で書いてください。見出しは「良かった点」「改善点」「書き出し例」の3つにし、Markdown の記号は使わないでください。",
    messages: [
      {
        role: "user",
        content: `質問: ${question}\n\n回答:\n${answer}\n\n参考(別の AI が付けた採点): ${scores}`,
      },
    ],
  });
  return { model: response.model, feedback: textOf(response) };
}
