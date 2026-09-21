// ダミーモードの問い合わせ判定。キーワードで判定する(本物の API ほど賢くはない)
import type { Answer, ClaudeEffort } from "../../shared/decision";
import type { DecideResult } from "../api";
import type { Department } from "../form/questions";
import { SLOTS, type SlotId } from "../slots";
import { dummyLatency, fakeProbabilities, sleep } from "./latency";

const DEPARTMENT_KEYWORDS: [Department, RegExp][] = [
  ["billing", /請求|料金|引き落と|支払|返金|課金|領収/g],
  ["account", /ログイン|パスワード|アカウント|会員/g],
  ["technical", /エラー|不具合|動かな|落ちる|バグ|表示されな/g],
  ["shipping", /届か|配送|発送|到着|注文した/g],
];

/** 文中で最後に出てきた話題を担当部署にする(途中で話が変わったときに切り替わるように) */
function department(text: string): Department {
  let best: Department = "other";
  let bestIndex = -1;
  for (const [dep, re] of DEPARTMENT_KEYWORDS) {
    for (const m of text.matchAll(re)) {
      if (m.index > bestIndex) {
        bestIndex = m.index;
        best = dep;
      }
    }
  }
  // 「解決しました」の前の話題は取り下げられたとみなす
  const resolved = text.lastIndexOf("解決");
  if (resolved > bestIndex) return "other";
  return best;
}

function urgency(text: string): number {
  if (/至急|今すぐ|すぐに|明日まで|緊急/.test(text)) return 3;
  if (/できません|入れません|届きません|困って/.test(text)) return 2;
  return text.length > 10 ? 1 : 0;
}

const refund = (text: string) => /返金|返品|二重/.test(text);
const angry = (text: string) => /解約|至急|ふざけ|いい加減|！|!/.test(text);

export async function dummyFormDecide(slot: SlotId, text: string, opusEffort: ClaudeEffort): Promise<DecideResult> {
  const { engine, model } = SLOTS[slot];
  const latencyMs = dummyLatency(engine, model, slot === "opus" ? opusEffort : "low");
  await sleep(latencyMs);

  const dep = department(text);
  const urg = urgency(text);
  const isJev = engine === "jev";
  const answers: Record<string, Answer> = {
    department: isJev
      ? { type: "choice", choice: dep, ...fakeProbabilities(dep, ["billing", "technical", "account", "shipping", "other"]) }
      : { type: "choice", choice: dep },
    urgency: isJev ? { type: "score", score: urg + (Math.random() - 0.5) * 0.4, confidence: 0.7 } : { type: "score", score: urg },
    refund: { type: "noul", noul: isJev ? (refund(text) ? 0.9 : 0.05) : refund(text) ? 1 : 0 },
    angry: { type: "noul", noul: isJev ? (angry(text) ? 0.8 : 0.1) : angry(text) ? 1 : 0 },
  };

  return {
    engine,
    model: `${model ?? "jev"}(ダミー)`,
    latencyMs,
    roundTripMs: latencyMs,
    answers,
  };
}
