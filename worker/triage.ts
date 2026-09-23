// 一次仕分けで「Jev が迷った件」だけを Claude に回す(エスカレーション)。
// 判定に加えて、なぜそう判断したかの一文を返させる(ここは文章なので Jev にはできない)
import Anthropic from "@anthropic-ai/sdk";
import type { ClaudeEffort, ClaudeModel } from "../shared/decision";

export async function escalate(
  apiKey: string,
  model: ClaudeModel,
  effort: ClaudeEffort,
  text: string,
  departments: Record<string, string>,
) {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    ...(model === "claude-haiku-4-5" ? {} : { output_config: { effort } }),
    system:
      "あなたはカスタマーサポートの二次対応担当です。一次受けの AI が判断に迷った問い合わせを、最終的に振り分けます。reason には、その振り分けにした理由を日本語で1文だけ書いてください。",
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          問い合わせ: text,
          部署の選択肢: departments,
          緊急度: "0=急ぎではない, 1=通常, 2=早めの対応が必要, 3=今すぐ対応が必要",
        }),
      },
    ],
    output_config: {
      ...(model === "claude-haiku-4-5" ? {} : { effort }),
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            department: { type: "string", enum: Object.keys(departments) },
            urgency: { type: "integer", enum: [0, 1, 2, 3] },
            reason: { type: "string" },
          },
          required: ["department", "urgency", "reason"],
          additionalProperties: false,
        },
      },
    },
  });

  if (response.stop_reason === "refusal") throw new Error("Claude が回答を拒否しました");
  if (response.stop_reason === "max_tokens") throw new Error("Claude の応答が max_tokens で打ち切られました");
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Claude の応答にテキストがありません");
  const parsed = JSON.parse(block.text) as { department: string; urgency: number; reason: string };

  return {
    model: response.model,
    ...parsed,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}
