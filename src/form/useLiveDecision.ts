import { useCallback, useEffect, useRef, useState } from "react";
import type { Answer, ClaudeModel, Engine } from "../../shared/decision";
import { decide } from "../api";
import { FORM_QUESTIONS } from "./questions";

/** これより短い入力は判定しない */
const MIN_CHARS = 4;

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
export function useLiveDecision(engine: Engine, text: string, model: ClaudeModel) {
  const [state, setState] = useState<LiveDecision>(initial);
  const latestText = useRef(text);
  latestText.current = text;
  const inFlight = useRef(false);
  const lastSent = useRef<string | null>(null);

  const pump = useCallback(async () => {
    if (inFlight.current) return;
    const t = latestText.current;
    if (t === lastSent.current || t.trim().length < MIN_CHARS) return;

    inFlight.current = true;
    lastSent.current = t;
    setState((s) => ({ ...s, pendingSince: performance.now(), error: undefined }));
    try {
      const res = await decide({
        engine,
        model,
        state: { 問い合わせ本文: t },
        questions: FORM_QUESTIONS,
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
  }, [engine, model]);

  // モデルを変えたら同じ入力でも判定し直す
  useEffect(() => {
    lastSent.current = null;
    setState(initial);
  }, [model]);

  useEffect(() => {
    void pump();
  }, [text, pump]);

  const reset = useCallback(() => {
    lastSent.current = null;
    setState(initial);
  }, []);

  return { ...state, reset };
}
