// ダミーモードの一次仕分け。部署はキーワード、確信度は「迷う文面かどうか」で決める
import type { Answer, EscalateResponse } from "../../shared/decision";
import type { DecideResult } from "../api";
import { DEPARTMENTS, type Department } from "../form/questions";
import { dummyLatency, sleep } from "./latency";

const KEYWORDS: [Department, RegExp][] = [
  ["billing", /請求|料金|引き落と|支払|返金|課金|領収|見積|プラン|カード/],
  ["account", /ログイン|パスワード|アカウント|認証|退会|解約|メンバー/],
  ["technical", /エラー|表示されません|落ちます|重い|動作|CSV|English|バグ/],
  ["shipping", /届き|配送|発送|到着|不在票|再配達|住所|破損|交換/],
];

/** 話題が2つ以上混ざる・情報が足りない文面は、確信度を低くする */
function judge(text: string): { department: Department; confidence: number } {
  const hits = KEYWORDS.filter(([, re]) => re.test(text));
  if (hits.length === 0) return { department: "other", confidence: 0.28 + Math.random() * 0.12 };
  if (hits.length >= 2) return { department: hits[0][0], confidence: 0.34 + Math.random() * 0.2 };
  if (text.length < 20) return { department: hits[0][0], confidence: 0.4 + Math.random() * 0.15 };
  return { department: hits[0][0], confidence: 0.72 + Math.random() * 0.26 };
}

function urgencyOf(text: string): number {
  if (/至急|いつまで|すぐに|止めて/.test(text)) return 3;
  if (/できません|届きません|落ちます|入れません/.test(text)) return 2;
  return 1;
}

export async function dummyTriageJudge(text: string): Promise<DecideResult> {
  const latencyMs = dummyLatency("jev");
  await sleep(latencyMs);
  const { department, confidence } = judge(text);
  const others = (Object.keys(DEPARTMENTS) as Department[]).filter((d) => d !== department);
  const probabilities = { [department]: confidence } as Record<string, number>;
  others.forEach((d, i) => (probabilities[d] = ((1 - confidence) * (i + 1)) / ((others.length * (others.length + 1)) / 2)));

  const answers: Record<string, Answer> = {
    department: { type: "choice", choice: department, confidence, probabilities },
    urgency: { type: "score", score: urgencyOf(text), confidence: 0.7 },
  };
  return {
    engine: "jev",
    model: "jev(ダミー)",
    latencyMs,
    roundTripMs: latencyMs,
    answers,
    // 実測に近い値(1件あたり入力 200 トークン前後)
    usage: { input_tokens: 180 + Math.round(text.length * 1.4), output_tokens: 0 },
  };
}

export async function dummyEscalate(text: string, effort: "low" | "medium" | "high"): Promise<EscalateResponse> {
  const latencyMs = dummyLatency("claude", "claude-opus-5", effort);
  await sleep(latencyMs);
  const hits = KEYWORDS.filter(([, re]) => re.test(text));
  // 文中で最後に出てきた話題を最終的な依頼とみなす(「〜と思ったら解決。ついでに〜」のような文面向け)
  let department: Department = "other";
  let lastIndex = -1;
  for (const [dep, re] of KEYWORDS) {
    for (const m of text.matchAll(new RegExp(re.source, "g"))) {
      if (m.index > lastIndex) {
        lastIndex = m.index;
        department = dep;
      }
    }
  }
  const reason =
    hits.length >= 2
      ? `複数の話題が含まれるが、最終的な依頼は${DEPARTMENTS[department].label}に関する内容のため。`
      : hits.length === 0
        ? "内容を特定できる情報がないため、一次窓口で折り返し確認が必要。"
        : `${DEPARTMENTS[department].label}の手続きに関する依頼と判断したため。`;
  return {
    model: "claude-opus-5(ダミー)",
    department,
    urgency: urgencyOf(text),
    reason: `${reason}(ダミーモード)`,
    latencyMs,
    usage: { input_tokens: 320 + Math.round(text.length * 1.4), output_tokens: 90 },
  };
}
