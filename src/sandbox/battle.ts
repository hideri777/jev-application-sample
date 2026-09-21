// ダミーモードのバトルの判断。docs/battle.md の検証で実際に見えた挙動を、単純なルールで再現する
import type { ClaudeEffort } from "../../shared/decision";
import {
  ENEMY_MOVES,
  availableActions,
  type BattleState,
  type HeroAction,
} from "../battle/engine";
import type { Decision } from "../battle/useBattle";
import { SLOTS, type SlotId } from "../slots";
import { dummyLatency, fakeProbabilities, sleep } from "./latency";

type Policy = (s: BattleState) => HeroAction;

const can = (s: BattleState, a: HeroAction) => availableActions(s).includes(a);
const recover = (s: BattleState): HeroAction => (can(s, "heal") ? "heal" : can(s, "herb") ? "herb" : "defend");
const strongest = (s: BattleState): HeroAction => (can(s, "spell") ? "spell" : "attack");

/** 予告を見て素直に動く(かんたんでは予告と「倒れる可能性」が渡されるので、Jev も Claude もこう動けた) */
const readsTelegraph: Policy = (s) => {
  const next = s.enemy.next;
  if (next === "smash" && !s.hero.defending) return "defend";
  if (s.hero.hp <= ENEMY_MOVES[next].max) return recover(s);
  return strongest(s);
};

// ---- Opus(むずかしい)用の先読み ----
// 乱数の出目は見ず、ダメージの平均で見積もる。敵の行動は、履歴が1周分たまったら周期を仮定し、
// それまでは最悪(痛恨の一撃)を想定して慎重に動く。HP は少し余裕を残す(勝率はルールベースで約9割)

interface Sim {
  hp: number;
  mp: number;
  herbs: number;
  defending: boolean;
  enemyHp: number;
}

const avg = (m: keyof typeof ENEMY_MOVES) => (ENEMY_MOVES[m].min + ENEMY_MOVES[m].max) / 2;
const PERIOD = 5;
const DEPTH = 6;
/** HP がこれ以下になる手は「倒れる」とみなす(平均で見積もるので、出目のぶれに備える) */
const SAFETY_MARGIN = 6;

function predictEnemy(s: BattleState, steps: number): number[] {
  const h = s.enemy.history;
  return Array.from({ length: steps }, (_, i) =>
    h.length >= PERIOD ? avg(h[h.length - PERIOD + (i % PERIOD)]) : avg("smash"),
  );
}

function step(x: Sim, a: HeroAction, enemyDamage: number): Sim | null {
  const n = { ...x };
  switch (a) {
    case "attack":
      n.enemyHp -= 16;
      break;
    case "spell":
      if (n.mp < 4) return null;
      n.mp -= 4;
      n.enemyHp -= 29;
      break;
    case "heal":
      if (n.mp < 5) return null;
      n.mp -= 5;
      n.hp = Math.min(100, n.hp + 45);
      break;
    case "herb":
      if (n.herbs === 0) return null;
      n.herbs -= 1;
      n.hp = Math.min(100, n.hp + 30);
      break;
    case "defend":
      n.defending = true;
      break;
  }
  if (n.enemyHp <= 0) return n;
  n.hp -= n.defending ? Math.floor(enemyDamage / 2) : enemyDamage;
  n.defending = false;
  return n;
}

function score(x: Sim, depth: number, enemy: number[]): number {
  if (x.enemyHp <= 0) return 10000 + depth;
  if (x.hp <= SAFETY_MARGIN) return -10000;
  if (depth === 0) return x.hp * 0.6 - x.enemyHp + x.mp * 1.5 + x.herbs * 8;
  let best = -Infinity;
  for (const a of ["spell", "attack", "heal", "herb", "defend"] as HeroAction[]) {
    const n = step(x, a, enemy[DEPTH - depth]);
    if (n) best = Math.max(best, score(n, depth - 1, enemy));
  }
  return best;
}

function planAhead(s: BattleState): HeroAction {
  const enemy = predictEnemy(s, DEPTH);
  const start: Sim = {
    hp: s.hero.hp,
    mp: s.hero.mp,
    herbs: s.hero.herbs,
    defending: s.hero.defending,
    enemyHp: s.enemy.hp,
  };
  let best: HeroAction = strongest(s);
  let bestScore = -Infinity;
  for (const a of availableActions(s)) {
    const n = step(start, a, enemy[0]);
    if (!n) continue;
    const v = score(n, DEPTH - 1, enemy);
    if (v > bestScore) {
      bestScore = v;
      best = a;
    }
  }
  return best;
}

export const POLICIES: Record<SlotId, Record<BattleState["difficulty"], Policy>> = {
  jev: {
    easy: readsTelegraph,
    // 検証では4戦とも「最初に1回攻撃し、あとは防御し続ける」だった
    hard: (s) => (s.enemy.hp === s.enemy.maxHp ? "attack" : "defend"),
  },
  haiku: {
    // 攻め中心。HP が減ったら回復
    easy: (s) => (s.hero.hp <= 30 ? recover(s) : strongest(s)),
    // 大きな攻撃を受けた「後」に防御してしまい、タイミングがずれる。回復は少なめで、あと一歩届かない
    hard: (s) => {
      const last = s.enemy.history.at(-1);
      if (s.hero.hp <= 20) return recover(s);
      if ((last === "breath" || last === "smash") && !s.hero.defending) return "defend";
      return strongest(s);
    },
  },
  opus: {
    easy: readsTelegraph,
    // 検証の Opus は回復・薬草・MP を配分して全勝した。単純なルールでは再現できないので、数手先まで読んで決める
    hard: (s) => planAhead(s),
  },
};

export async function dummyBattleDecision(
  slot: SlotId,
  state: BattleState,
  opusEffort: ClaudeEffort,
): Promise<Decision> {
  const { engine, model } = SLOTS[slot];
  const latencyMs = dummyLatency(engine, model, slot === "opus" ? opusEffort : "low");
  await sleep(latencyMs);
  const action = POLICIES[slot][state.difficulty](state);
  // 確率を返すのは Jev だけ(本物の API と同じ)
  return engine === "jev"
    ? { action, latencyMs, ...fakeProbabilities(action, availableActions(state)) }
    : { action, latencyMs };
}
