// ダミーモードで待つ時間。検証で測った実際の応答時間(docs/presentation.md)に合わせている
import type { ClaudeEffort, ClaudeModel, Engine } from "../../shared/decision";

const RANGES = {
  jev: [240, 360],
  "claude-haiku-4-5": [800, 1100],
  "claude-sonnet-5": [1500, 2500],
  "opus-low": [1800, 2800],
  "opus-medium": [4500, 7500],
  "opus-high": [8000, 12000],
} as const;

export function dummyLatency(engine: Engine, model?: ClaudeModel, effort: ClaudeEffort = "low"): number {
  const [min, max] =
    engine === "jev"
      ? RANGES.jev
      : model === "claude-opus-5"
        ? RANGES[`opus-${effort}`]
        : RANGES[model ?? "claude-haiku-4-5"];
  return Math.round(min + Math.random() * (max - min));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 選んだ答えに確率を振る(Jev らしい見た目にするため。値に意味はない) */
export function fakeProbabilities<T extends string>(chosen: T, options: T[], top = 0.4 + Math.random() * 0.4) {
  const others = options.filter((o) => o !== chosen);
  const weights = others.map(() => Math.random() + 0.1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const probabilities = { [chosen]: top } as Record<T, number>;
  others.forEach((o, i) => (probabilities[o] = ((1 - top) * weights[i]) / sum));
  return { probabilities, confidence: top };
}
