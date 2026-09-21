import type { ClaudeModel, Engine } from "../shared/decision";

/** 画面に並べる判断エンジン。Claude はモデルを固定し、Opus だけ effort を選べる */
export type SlotId = "jev" | "haiku" | "opus";

export const SLOTS: Record<SlotId, { label: string; engine: Engine; model?: ClaudeModel }> = {
  jev: { label: "Jev", engine: "jev" },
  haiku: { label: "Claude Haiku 4.5", engine: "claude", model: "claude-haiku-4-5" },
  opus: { label: "Claude Opus 5", engine: "claude", model: "claude-opus-5" },
};

export const SLOT_IDS = Object.keys(SLOTS) as SlotId[];
