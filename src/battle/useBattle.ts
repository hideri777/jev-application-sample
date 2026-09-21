import { useCallback, useEffect, useRef, useState } from "react";
import type { ClaudeEffort, ClaudeModel, Engine } from "../../shared/decision";
import { decide } from "../api";
import {
  applyEnemyMove,
  applyHeroAction,
  createBattle,
  toActionQuestion,
  toDecisionState,
  type BattleState,
  type Difficulty,
  type HeroAction,
  type LogEntry,
} from "./engine";

export type BattleMode = "turn" | "realtime";

/** 画面に並べる対戦者。Claude はモデルを固定し、Opus だけ effort を選べる */
export type SlotId = "jev" | "haiku" | "opus";

export const SLOTS: Record<SlotId, { label: string; engine: Engine; model?: ClaudeModel }> = {
  jev: { label: "Jev", engine: "jev" },
  haiku: { label: "Claude Haiku 4.5", engine: "claude", model: "claude-haiku-4-5" },
  opus: { label: "Claude Opus 5", engine: "claude", model: "claude-opus-5" },
};

export const SLOT_IDS = Object.keys(SLOTS) as SlotId[];

export interface BattleConfig {
  difficulty: Difficulty;
  mode: BattleMode;
  /** リアルタイムモードで敵が行動する間隔 */
  enemyIntervalMs: number;
  opusEffort: ClaudeEffort;
  seed: number;
  /** 今回動かす対戦者。含まれない対戦者は前回の結果を残す */
  slots: SlotId[];
}

/** その対戦がどの条件で行われたか(前回の結果と今の設定を見比べるため) */
export type ArenaConditions = Pick<BattleConfig, "difficulty" | "mode" | "enemyIntervalMs" | "seed"> & {
  effort?: ClaudeEffort;
};

export interface Decision {
  action: HeroAction;
  latencyMs: number;
  confidence?: number;
  probabilities?: Record<string, number>;
}

export interface Arena {
  state: BattleState;
  log: LogEntry[];
  decisions: Decision[];
  /** 判断待ちになった時刻(performance.now)。判断中でなければ null */
  thinkingSince: number | null;
  error?: string;
  startedAt: number | null;
  endedAt: number | null;
  /** まだ一度も動かしていなければ null */
  conditions: ArenaConditions | null;
}

const TURN_PAUSE_MS = 400;
const MAX_LOG = 40;

function freshArena(seed: number, difficulty: Difficulty = "easy"): Arena {
  return {
    state: createBattle(seed, difficulty),
    log: [],
    decisions: [],
    thinkingSince: null,
    startedAt: null,
    endedAt: null,
    conditions: null,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useBattle() {
  // 非同期ループからは常に最新の状態を読みたいので ref に持ち、描画は tick で起こす
  const arenasRef = useRef<Record<SlotId, Arena>>({
    jev: freshArena(1),
    haiku: freshArena(1),
    opus: freshArena(1),
  });
  const [, setTick] = useState(0);
  const runIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const [runningSlots, setRunningSlots] = useState<SlotId[]>([]);

  const update = useCallback((slot: SlotId, fn: (a: Arena) => Arena) => {
    arenasRef.current = { ...arenasRef.current, [slot]: fn(arenasRef.current[slot]) };
    setTick((t) => t + 1);
  }, []);

  const finishIfOver = (a: Arena): Arena =>
    a.state.result && a.endedAt === null ? { ...a, thinkingSince: null, endedAt: performance.now() } : a;

  const pushLog = (a: Arena, entry: LogEntry): LogEntry[] => [...a.log, entry].slice(-MAX_LOG);

  const enemyTurn = useCallback(
    (slot: SlotId) =>
      update(slot, (a) => {
        if (a.state.result) return a;
        const [state, entry] = applyEnemyMove(a.state);
        return finishIfOver({ ...a, state, log: pushLog(a, entry) });
      }),
    [update],
  );

  const heroLoop = useCallback(
    async (slot: SlotId, runId: number, config: BattleConfig) => {
      const alive = () => runIdRef.current === runId;
      const { engine, model } = SLOTS[slot];

      while (alive() && !arenasRef.current[slot].state.result) {
        const snapshot = arenasRef.current[slot];
        update(slot, (a) => ({ ...a, thinkingSince: performance.now(), error: undefined }));

        let decision: Decision;
        try {
          const res = await decide({
            engine,
            model,
            effort: slot === "opus" ? config.opusEffort : "low",
            state: toDecisionState(snapshot.state, snapshot.log.slice(-3)),
            questions: toActionQuestion(snapshot.state),
          });
          const answer = res.answers.action;
          if (answer?.type !== "choice") throw new Error("action の回答がありません");
          decision = {
            action: answer.choice as HeroAction,
            latencyMs: res.latencyMs,
            confidence: answer.confidence,
            probabilities: answer.probabilities,
          };
        } catch (e) {
          if (!alive()) return;
          update(slot, (a) => ({ ...a, thinkingSince: null, error: (e as Error).message }));
          await sleep(1000);
          continue;
        }
        if (!alive()) return;

        // リアルタイムでは考えている間に敵が動いているので、最新の状態に行動を適用する
        update(slot, (a) => {
          if (a.state.result) return a;
          const [state, entry] = applyHeroAction(a.state, decision.action);
          return finishIfOver({
            ...a,
            state,
            log: pushLog(a, entry),
            decisions: [...a.decisions, decision],
            thinkingSince: null,
          });
        });

        if (config.mode === "turn" && !arenasRef.current[slot].state.result) {
          await sleep(TURN_PAUSE_MS);
          if (!alive()) return;
          enemyTurn(slot);
          await sleep(TURN_PAUSE_MS);
        }
      }
    },
    [enemyTurn, update],
  );

  const stop = useCallback(() => {
    runIdRef.current += 1;
    timersRef.current.forEach((t) => clearInterval(t));
    timersRef.current = [];
    for (const slot of SLOT_IDS) update(slot, (a) => ({ ...a, thinkingSince: null }));
    setRunningSlots([]);
  }, [update]);

  const start = useCallback(
    (config: BattleConfig) => {
      if (config.slots.length === 0) return;
      stop();
      const runId = runIdRef.current;
      const now = performance.now();
      for (const slot of config.slots) {
        arenasRef.current[slot] = {
          ...freshArena(config.seed, config.difficulty),
          startedAt: now,
          conditions: {
            difficulty: config.difficulty,
            mode: config.mode,
            enemyIntervalMs: config.enemyIntervalMs,
            seed: config.seed,
            effort: slot === "opus" ? config.opusEffort : undefined,
          },
        };
      }
      setTick((t) => t + 1);
      setRunningSlots(config.slots);

      for (const slot of config.slots) {
        if (config.mode === "realtime") {
          const timer = window.setInterval(() => {
            if (runIdRef.current !== runId || arenasRef.current[slot].state.result) {
              clearInterval(timer);
              return;
            }
            enemyTurn(slot);
          }, config.enemyIntervalMs);
          timersRef.current.push(timer);
        }
        void heroLoop(slot, runId, config);
      }
    },
    [enemyTurn, heroLoop, stop],
  );

  // 今回動かした対戦者の決着がすべてついたら止める
  const arenas = arenasRef.current;
  const running = runningSlots.length > 0;
  const allOver = runningSlots.every((s) => arenas[s].state.result);
  useEffect(() => {
    if (running && allOver) stop();
  }, [running, allOver, stop]);

  useEffect(() => stop, [stop]);

  return { arenas, running, runningSlots, start, stop };
}
