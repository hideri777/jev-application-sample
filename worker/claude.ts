import Anthropic from "@anthropic-ai/sdk";
import type { Answer, ClaudeEffort, ClaudeModel, Questions } from "../shared/decision";

const SYSTEM_PROMPT =
  "あなたは意思決定関数です。state を読み、questions の各質問に指定の形式で答えてください。説明文は不要です。";

/** 質問を Claude の構造化出力用 JSON Schema に変換し、回答の選択肢を Jev と同じ範囲に縛る */
function toJsonSchema(questions: Questions) {
  const properties: Record<string, unknown> = {};
  for (const [key, q] of Object.entries(questions)) {
    if (q.type === "choice") {
      properties[key] = { type: "string", enum: Object.keys(q.criteria) };
    } else if (q.type === "score") {
      properties[key] = {
        type: "integer",
        enum: q.criteria.map((_, i) => i),
      };
    } else {
      properties[key] = { type: "boolean" };
    }
  }
  return {
    type: "object",
    properties,
    required: Object.keys(questions),
    additionalProperties: false,
  };
}

function toAnswers(
  questions: Questions,
  raw: Record<string, unknown>,
): Record<string, Answer> {
  const answers: Record<string, Answer> = {};
  for (const [key, q] of Object.entries(questions)) {
    const v = raw[key];
    if (q.type === "choice") answers[key] = { type: "choice", choice: String(v) };
    else if (q.type === "score") answers[key] = { type: "score", score: Number(v) };
    else answers[key] = { type: "noul", noul: v === true ? 1 : 0 };
  }
  return answers;
}

export async function decideWithClaude(
  apiKey: string,
  model: ClaudeModel,
  effort: ClaudeEffort,
  state: unknown,
  questions: Questions,
) {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    // effort を上げると考える時間(thinking)にトークンを使うので余裕を持たせる
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: JSON.stringify({ state, questions }) },
    ],
    output_config: {
      // Haiku 4.5 は effort 非対応なので付けない
      ...(model === "claude-haiku-4-5" ? {} : { effort }),
      format: { type: "json_schema", schema: toJsonSchema(questions) },
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude が回答を拒否しました");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude の応答が max_tokens で打ち切られました");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Claude の応答にテキストがありません");
  }

  return {
    model: response.model,
    answers: toAnswers(questions, JSON.parse(text.text)),
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}
