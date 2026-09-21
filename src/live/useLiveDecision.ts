import { useCallback, useEffect, useRef, useState } from "react";
import type { Answer, ClaudeEffort, Questions } from "../../shared/decision";
import { decide, type DecideResult } from "../api";
import { SLOTS, type SlotId } from "../slots";

/** 入力中に判定し続ける対象ごとの定義。描画のたびに作り直さないよう、モジュールの定数として定義する */
export interface LiveJudgeSpec {
  questions: Questions;
  /** 入力テキスト(と、質問文などの前提)から判断モデルに渡す state を作る */
  toState: (text: string, context: string) => unknown;
  /** ダミーモードでの判定 */
  dummy: (slot: SlotId, text: string, context: string, effort: ClaudeEffort) => Promise<DecideResult>;
  /** これより短い入力は判定しない */
  minChars: number;
}

export interface LiveDecision {
  answers?: Record<string, Answer>;
  /** この判定がどの入力に対するものか */
  forText?: string;
  latencyMs?: number;
  /** 判定待ちになった時刻。待っていなければ null */
  pendingSince: number | null;
  count: number;
  totalLatencyMs: number;
  error?: string;
}

const initial: LiveDecision = { pendingSince: null, count: 0, totalLatencyMs: 0 };

/**
 * 入力が変わるたびに判定する。同時に投げるのは1件だけで、
 * 判定が返った時点で入力が進んでいれば、最新の入力ですぐに次を投げる(古い入力は飛ばす)。
 * こうすると「そのエンジンが出せる最速のペースで入力に追いつこうとする」状態になる。
 */
export function useLiveDecision(
  slot: SlotId,
  text: string,
  options: { spec: LiveJudgeSpec; effort: ClaudeEffort; sandbox: boolean; context?: string },
) {
  const { spec, effort, sandbox, context = "" } = options;
  const [state, setState] = useState<LiveDecision>(initial);
  const latestText = useRef(text);
  latestText.current = text;
  const inFlight = useRef(false);
  const lastSent = useRef<string | null>(null);

  const pump = useCallback(async () => {
    if (inFlight.current) return;
    const t = latestText.current;
    if (t === lastSent.current || t.trim().length < spec.minChars) return;

    inFlight.current = true;
    lastSent.current = t;
    setState((s) => ({ ...s, pendingSince: performance.now(), error: undefined }));
    try {
      const res = sandbox
        ? await spec.dummy(slot, t, context, effort)
        : await decide({
            engine: SLOTS[slot].engine,
            model: SLOTS[slot].model,
            effort,
            state: spec.toState(t, context),
            questions: spec.questions,
          });
      setState((s) => ({
        ...s,
        answers: res.answers,
        forText: t,
        latencyMs: res.latencyMs,
        count: s.count + 1,
        totalLatencyMs: s.totalLatencyMs + res.latencyMs,
      }));
    } catch (e) {
      setState((s) => ({ ...s, error: (e as Error).message }));
    } finally {
      inFlight.current = false;
      setState((s) => ({ ...s, pendingSince: null }));
      void pump();
    }
  }, [slot, spec, effort, sandbox, context]);

  // effort・モード・前提(質問文など)が変わったら、同じ入力でも判定し直す
  useEffect(() => {
    lastSent.current = null;
    setState(initial);
  }, [effort, sandbox, context]);

  useEffect(() => {
    void pump();
  }, [text, pump]);

  const reset = useCallback(() => {
    lastSent.current = null;
    setState(initial);
  }, []);

  return { ...state, reset };
}
