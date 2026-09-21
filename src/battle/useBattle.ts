import { useCallback, useEffect, useRef, useState } from "react";
import type { ClaudeModel, Engine } from "../../shared/decision";
import { decide } from "../api";
import {
  applyEnemyMove,
  applyHeroAction,
  createBattle,
  toActionQuestion,
  toDecisionState,
  type BattleState,
  type HeroAction,
  type LogEntry,
} from "./engine";

export type BattleMode = "turn" | "realtime";

export interface BattleConfig {
  mode: BattleMode;
  /** リアルタイムモードで敵が行動する間隔 */
  enemyIntervalMs: number;
  model: ClaudeModel;
  seed: number;
}

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
}

const ENGINES: Engine[] = ["jev", "claude"];
const TURN_PAUSE_MS = 400;
const MAX_LOG = 40;

function freshArena(seed: number): Arena {
  return {
    state: createBattle(seed),
    log: [],
    decisions: [],
    thinkingSince: null,
    startedAt: null,
    endedAt: null,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useBattle() {
  // 非同期ループからは常に最新の状態を読みたいので ref に持ち、描画は tick で起こす
  const arenasRef = useRef<Record<Engine, Arena>>({
    jev: freshArena(1),
    claude: freshArena(1),
  });
  const [, setTick] = useState(0);
  const runIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const [running, setRunning] = useState(false);

  const update = useCallback((engine: Engine, fn: (a: Arena) => Arena) => {
    arenasRef.current = { ...arenasRef.current, [engine]: fn(arenasRef.current[engine]) };
    setTick((t) => t + 1);
  }, []);

  const finishIfOver = (a: Arena): Arena =>
    a.state.result && a.endedAt === null ? { ...a, thinkingSince: null, endedAt: performance.now() } : a;

  const pushLog = (a: Arena, entry: LogEntry): LogEntry[] => [...a.log, entry].slice(-MAX_LOG);

  const enemyTurn = useCallback(
    (engine: Engine) =>
      update(engine, (a) => {
        if (a.state.result) return a;
        const [state, entry] = applyEnemyMove(a.state);
        return finishIfOver({ ...a, state, log: pushLog(a, entry) });
      }),
    [update],
  );

  const heroLoop = useCallback(
    async (engine: Engine, runId: number, config: BattleConfig) => {
      const alive = () => runIdRef.current === runId;

      while (alive() && !arenasRef.current[engine].state.result) {
        const snapshot = arenasRef.current[engine];
        update(engine, (a) => ({ ...a, thinkingSince: performance.now(), error: undefined }));

        let decision: Decision;
        try {
          const res = await decide({
            engine,
            model: config.model,
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
          update(engine, (a) => ({ ...a, thinkingSince: null, error: (e as Error).message }));
          await sleep(1000);
          continue;
        }
        if (!alive()) return;

        // リアルタイムでは考えている間に敵が動いているので、最新の状態に行動を適用する
        update(engine, (a) => {
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

        if (config.mode === "turn" && !arenasRef.current[engine].state.result) {
          await sleep(TURN_PAUSE_MS);
          if (!alive()) return;
          enemyTurn(engine);
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
    for (const engine of ENGINES) update(engine, (a) => ({ ...a, thinkingSince: null }));
    setRunning(false);
  }, [update]);

  const start = useCallback(
    (config: BattleConfig) => {
      stop();
      const runId = runIdRef.current;
      const now = performance.now();
      for (const engine of ENGINES) {
        arenasRef.current[engine] = { ...freshArena(config.seed), startedAt: now };
      }
      setTick((t) => t + 1);
      setRunning(true);

      for (const engine of ENGINES) {
        if (config.mode === "realtime") {
          const timer = window.setInterval(() => {
            if (runIdRef.current !== runId || arenasRef.current[engine].state.result) {
              clearInterval(timer);
              return;
            }
            enemyTurn(engine);
          }, config.enemyIntervalMs);
          timersRef.current.push(timer);
        }
        void heroLoop(engine, runId, config);
      }
    },
    [enemyTurn, heroLoop, stop],
  );

  // 両方の決着がついたら running を戻す
  const arenas = arenasRef.current;
  const allOver = ENGINES.every((e) => arenas[e].state.result);
  useEffect(() => {
    if (running && allOver) stop();
  }, [running, allOver, stop]);

  useEffect(() => stop, [stop]);

  return { arenas, running, start, stop };
}
