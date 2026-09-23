// 料金の概算。公表されている単価(100万トークンあたりの USD)
const PRICES: Record<string, { input: number; output: number }> = {
  jev: { input: 0.042, output: 0 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5": { input: 5, output: 25 },
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

/** モデル名(返ってくる値は claude-haiku-4-5-20251001 のように末尾が付くので前方一致で見る) */
function priceOf(model: string) {
  if (model.startsWith("jev")) return PRICES.jev;
  const key = Object.keys(PRICES).find((k) => model.startsWith(k));
  return key ? PRICES[key] : PRICES["claude-haiku-4-5"];
}

export function costUsd(model: string, usage: Usage | undefined): number {
  if (!usage) return 0;
  const p = priceOf(model);
  return (usage.input_tokens * p.input + usage.output_tokens * p.output) / 1_000_000;
}

export function formatUsd(v: number): string {
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}
