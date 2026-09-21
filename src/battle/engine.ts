// ドラクエ風バトルのルール。React に依存しない純粋な関数だけで書く。

export type HeroAction = "attack" | "spell" | "heal" | "herb" | "defend";
export type EnemyMove = "claw" | "breath" | "focus" | "smash";
/** easy: 敵が次の行動を予告し、危険度も計算して渡す / hard: 予告なし。敵の周期を履歴から読む必要がある */
export type Difficulty = "easy" | "hard";

export interface BattleState {
  hero: {
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    herbs: number;
    defending: boolean;
  };
  enemy: {
    name: string;
    hp: number;
    maxHp: number;
    next: EnemyMove;
    /** これまでの行動(古い順)。hard ではこれが周期を読む唯一の手がかり */
    history: EnemyMove[];
  };
  difficulty: Difficulty;
  result: "win" | "lose" | null;
  seed: number;
}

export interface LogEntry {
  side: "hero" | "enemy";
  text: string;
}

export const ACTIONS: Record<HeroAction, { label: string; description: string; mp?: number }> = {
  attack: { label: "たたかう", description: "通常攻撃。敵に14〜18のダメージ" },
  spell: { label: "メラミ", description: "MP4を使う攻撃呪文。敵に26〜32のダメージ", mp: 4 },
  heal: { label: "ベホイミ", description: "MP5を使う回復呪文。勇者のHPを45回復", mp: 5 },
  herb: { label: "やくそう", description: "勇者のHPを30回復(数に限りあり)" },
  defend: {
    label: "ぼうぎょ",
    description: "次に受ける敵の攻撃のダメージを半分にする。敵にダメージは与えられない",
  },
};

export const ENEMY_MOVES: Record<
  EnemyMove,
  { name: string; telegraph: string; min: number; max: number }
> = {
  claw: { name: "爪", telegraph: "爪をとぎすませている(次は通常攻撃、8〜12ダメージ)", min: 8, max: 12 },
  breath: { name: "激しい炎", telegraph: "大きく息を吸い込んだ！(次は激しい炎、22〜28ダメージ)", min: 22, max: 28 },
  focus: { name: "力をためる", telegraph: "じっとこちらを見ている(次は力をためる、ダメージなし)", min: 0, max: 0 },
  smash: { name: "痛恨の一撃", telegraph: "ためた力を解き放とうとしている！(次は痛恨の一撃、38〜46ダメージ)", min: 38, max: 46 },
};

export const HARD_ENEMY_HP = 210;

// 再現できる乱数(mulberry32)。同じシードなら Jev と Claude は同じ出目の列を引く
function random(state: BattleState): number {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function roll(state: BattleState, min: number, max: number) {
  return min + Math.floor(random(state) * (max - min + 1));
}

/** hard の敵はこの周期を繰り返す(判断モデルには周期の中身は教えない) */
export const HARD_PATTERN: EnemyMove[] = ["claw", "claw", "breath", "claw", "smash"];

function pickNextEnemyMove(state: BattleState, prev: EnemyMove): EnemyMove {
  if (state.difficulty === "hard") {
    return HARD_PATTERN[state.enemy.history.length % HARD_PATTERN.length];
  }
  if (prev === "focus") return "smash";
  const r = random(state);
  if (r < 0.5) return "claw";
  if (r < 0.75) return "breath";
  return "focus";
}

export function createBattle(seed: number, difficulty: Difficulty = "easy"): BattleState {
  const enemyHp = difficulty === "hard" ? HARD_ENEMY_HP : 180;
  return {
    hero: { hp: 100, maxHp: 100, mp: 30, maxMp: 30, herbs: 3, defending: false },
    enemy: {
      name: "ドラゴン",
      hp: enemyHp,
      maxHp: enemyHp,
      next: difficulty === "hard" ? HARD_PATTERN[0] : "claw",
      history: [],
    },
    difficulty,
    result: null,
    seed,
  };
}

export function availableActions(state: BattleState): HeroAction[] {
  return (Object.keys(ACTIONS) as HeroAction[]).filter((a) => {
    const mp = ACTIONS[a].mp ?? 0;
    if (state.hero.mp < mp) return false;
    if (a === "herb" && state.hero.herbs === 0) return false;
    return true;
  });
}

/** 状態を複製して返す(React の state をそのまま書き換えないため) */
function clone(state: BattleState): BattleState {
  return {
    ...state,
    hero: { ...state.hero },
    enemy: { ...state.enemy, history: [...state.enemy.history] },
  };
}

export function applyHeroAction(prev: BattleState, action: HeroAction): [BattleState, LogEntry] {
  const s = clone(prev);
  const h = s.hero;
  const e = s.enemy;
  let text: string;

  if (!availableActions(s).includes(action)) {
    return [s, { side: "hero", text: `${ACTIONS[action].label}は使えない！ 勇者はとまどっている` }];
  }

  switch (action) {
    case "attack": {
      const dmg = roll(s, 14, 18);
      e.hp = Math.max(0, e.hp - dmg);
      text = `勇者の攻撃！ ${e.name}に${dmg}のダメージ`;
      break;
    }
    case "spell": {
      const dmg = roll(s, 26, 32);
      h.mp -= 4;
      e.hp = Math.max(0, e.hp - dmg);
      text = `勇者はメラミを唱えた！ ${e.name}に${dmg}のダメージ`;
      break;
    }
    case "heal": {
      h.mp -= 5;
      const healed = Math.min(45, h.maxHp - h.hp);
      h.hp += healed;
      text = `勇者はベホイミを唱えた！ HPが${healed}回復`;
      break;
    }
    case "herb": {
      h.herbs -= 1;
      const healed = Math.min(30, h.maxHp - h.hp);
      h.hp += healed;
      text = `勇者はやくそうを使った！ HPが${healed}回復`;
      break;
    }
    case "defend":
      h.defending = true;
      text = "勇者は身を守っている";
      break;
  }

  if (e.hp === 0) s.result = "win";
  return [s, { side: "hero", text }];
}

export function applyEnemyMove(prev: BattleState): [BattleState, LogEntry] {
  const s = clone(prev);
  const h = s.hero;
  const e = s.enemy;
  const move = e.next;
  let text: string;

  if (move === "focus") {
    text = `${e.name}は力をためている…`;
  } else {
    const base = roll(s, ENEMY_MOVES[move].min, ENEMY_MOVES[move].max);
    const dmg = h.defending ? Math.floor(base / 2) : base;
    h.hp = Math.max(0, h.hp - dmg);
    const name = { claw: "爪で切り裂いた", breath: "激しい炎をはいた", smash: "痛恨の一撃！" }[move];
    text = `${e.name}は${name} 勇者は${dmg}のダメージ${h.defending ? "(ぼうぎょで半減)" : ""}`;
  }

  h.defending = false;
  e.history.push(move);
  e.next = pickNextEnemyMove(s, move);
  if (h.hp === 0) s.result = "lose";
  return [s, { side: "enemy", text }];
}

/** 判断モデルに渡す状態。割合などの計算はコード側で済ませておく(Jev は計算が苦手) */
export function toDecisionState(state: BattleState, recentLog: LogEntry[]) {
  return state.difficulty === "hard"
    ? toHardDecisionState(state, recentLog)
    : toEasyDecisionState(state, recentLog);
}

/** hard: 予告も計算済みのヒントも渡さない。生の数値と敵の行動履歴だけ */
function toHardDecisionState(state: BattleState, recentLog: LogEntry[]) {
  const { hero, enemy } = state;
  return {
    勇者: {
      HP: `${hero.hp}/${hero.maxHp}`,
      MP: `${hero.mp}/${hero.maxMp}`,
      やくそうの残り: hero.herbs,
      ぼうぎょ中: hero.defending,
    },
    敵: {
      名前: enemy.name,
      HP: `${enemy.hp}/${enemy.maxHp}`,
      使う技: (["claw", "breath", "smash"] as const).map(
        (m) => `${ENEMY_MOVES[m].name}(${ENEMY_MOVES[m].min}〜${ENEMY_MOVES[m].max}ダメージ)`,
      ),
      これまでの行動_古い順: enemy.history.map((m) => ENEMY_MOVES[m].name),
    },
    直近の出来事: recentLog.map((l) => l.text),
  };
}

function toEasyDecisionState(state: BattleState, recentLog: LogEntry[]) {
  const { hero, enemy } = state;
  const maxDamage = ENEMY_MOVES[enemy.next].max;
  return {
    勇者: {
      HP: `${hero.hp}/${hero.maxHp}(${Math.round((hero.hp / hero.maxHp) * 100)}%)`,
      MP: `${hero.mp}/${hero.maxMp}`,
      やくそうの残り: hero.herbs,
      ぼうぎょ中: hero.defending,
    },
    敵: {
      名前: enemy.name,
      HP: `${Math.round((enemy.hp / enemy.maxHp) * 100)}%`,
      次の行動の予兆: `${enemy.name}は${ENEMY_MOVES[enemy.next].telegraph}`,
    },
    次の敵の攻撃の見込み: {
      最大ダメージ: maxDamage,
      そのまま受けると倒れる可能性: hero.hp <= maxDamage,
      ぼうぎょしても倒れる可能性: hero.hp <= Math.floor(maxDamage / 2),
    },
    直近の出来事: recentLog.map((l) => l.text),
  };
}

export function toActionQuestion(state: BattleState) {
  const criteria: Record<string, string> = {};
  for (const a of availableActions(state)) {
    criteria[a] = `${ACTIONS[a].label}: ${ACTIONS[a].description}`;
  }
  const instructions =
    state.difficulty === "hard"
      ? "あなたは勇者。目的はドラゴンのHPを0にすること。勇者のHPが0になると負け。ドラゴンの行動は決まった周期で繰り返されるが、予告はない。これまでの行動履歴から次の行動を予測し、攻撃・回復・ぼうぎょを使い分けて、次にとる最善の行動を選べ。"
      : "あなたは勇者。目的はドラゴンのHPを0にすること。勇者のHPが0になると負け。攻撃しなければ勝てないが、倒れたら終わり。敵の予兆と「次の敵の攻撃の見込み」を見て、攻撃・回復・ぼうぎょを使い分け、次にとる最善の行動を選べ。";
  return {
    action: {
      type: "choice" as const,
      instructions,
      criteria,
    },
  };
}
