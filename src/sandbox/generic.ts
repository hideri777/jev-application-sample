// ダミーモードの Playground 用。自由に書かれた質問の中身は理解できないので、
// 選択肢の説明と state の文字の重なりで、それらしい答えを選ぶだけ
import type { Answer, DecideRequest } from "../../shared/decision";
import type { DecideResult } from "../api";
import { dummyLatency, fakeProbabilities, sleep } from "./latency";

function bigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) set.add(text.slice(i, i + 2));
  return set;
}

function overlap(a: Set<string>, text: string): number {
  let n = 0;
  for (const g of bigrams(text)) if (a.has(g)) n++;
  return n;
}

export async function dummyGenericDecide(req: DecideRequest): Promise<DecideResult> {
  const latencyMs = dummyLatency(req.engine, req.model, req.effort);
  await sleep(latencyMs);

  const stateGrams = bigrams(JSON.stringify(req.state));
  const isJev = req.engine === "jev";
  const answers: Record<string, Answer> = {};

  for (const [key, q] of Object.entries(req.questions)) {
    if (q.type === "choice") {
      const labels = Object.keys(q.criteria);
      const scored = labels.map((l) => [l, overlap(stateGrams, `${l}${q.criteria[l] ?? ""}`)] as const);
      const choice = scored.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
      answers[key] = isJev ? { type: "choice", choice, ...fakeProbabilities(choice, labels) } : { type: "choice", choice };
    } else if (q.type === "score") {
      const score = Math.floor(q.criteria.length / 2);
      answers[key] = isJev ? { type: "score", score: score + Math.random() * 0.6 - 0.3, confidence: 0.6 } : { type: "score", score };
    } else {
      const p = Math.min(0.95, 0.2 + overlap(stateGrams, q.instructions) * 0.1);
      answers[key] = { type: "noul", noul: isJev ? p : p >= 0.5 ? 1 : 0 };
    }
  }

  return {
    engine: req.engine,
    model: `${isJev ? "jev" : req.model}(ダミー)`,
    latencyMs,
    roundTripMs: latencyMs,
    answers,
  };
}
