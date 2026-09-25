import { useEffect, useRef, useState, type ReactNode } from "react";
import { CLAUDE_EFFORTS, type ClaudeEffort } from "../../shared/decision";
import { ACTIONS, ENEMY_MOVES, type Difficulty, type HeroAction } from "../battle/engine";
import {
  SLOT_IDS,
  SLOTS,
  useBattle,
  type Arena,
  type ArenaConditions,
  type BattleMode,
  type SlotId,
} from "../battle/useBattle";
import { useSandbox } from "../sandbox/SandboxContext";

/** 難易度ごとのおすすめ設定。難易度を切り替えるとこれが入る(その後は個別に変えられる) */
const PRESETS: Record<Difficulty, { mode: BattleMode; opusEffort: ClaudeEffort }> = {
  easy: { mode: "realtime", opusEffort: "low" },
  hard: { mode: "turn", opusEffort: "medium" },
};

const DIFFICULTY_NOTE: Record<Difficulty, string> = {
  easy: "敵は次の行動を予告し、「次の攻撃で倒れるか」も計算して渡す。素早く反応できれば勝てる。",
  hard: "予告なし。敵は決まった周期で行動するが、中身は行動履歴から読むしかない。渡すのは生の数値だけ。",
};

const ACCENTS: Record<SlotId, string> = {
  jev: "text-amber-300",
  haiku: "text-sky-300",
  opus: "text-violet-300",
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "かんたん", hard: "むずかしい" };
const MODE_LABEL: Record<BattleMode, string> = { realtime: "リアルタイム", turn: "ターン制" };

export function Battle() {
  const { arenas, running, runningSlots, start, stop } = useBattle();
  /** 勝敗の表示を閉じた列(閉じるとログが読める) */
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  /** 3列のログを並べて見るモーダル */
  const [logOpen, setLogOpen] = useState(false);
  const { enabled: sandbox } = useSandbox();
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [mode, setMode] = useState<BattleMode>(PRESETS.easy.mode);
  const [enemyIntervalMs, setEnemyIntervalMs] = useState(1000);
  const [opusEffort, setOpusEffort] = useState<ClaudeEffort>(PRESETS.easy.opusEffort);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));
  const [selected, setSelected] = useState<Record<SlotId, boolean>>({ jev: true, haiku: true, opus: true });

  const chooseDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    setMode(PRESETS[d].mode);
    setOpusEffort(PRESETS[d].opusEffort);
  };

  const slots = SLOT_IDS.filter((id) => selected[id]);
  const finished = SLOT_IDS.filter((id) => arenas[id].state.result !== null);
  const current: ArenaConditions = { difficulty, mode, enemyIntervalMs, seed, sandbox };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <div className="flex overflow-hidden rounded ring-1 ring-slate-700">
          {(["easy", "hard"] as const).map((d) => (
            <button
              key={d}
              disabled={running}
              onClick={() => chooseDifficulty(d)}
              className={`px-3 py-1.5 ${difficulty === d ? "bg-rose-400 text-slate-950" : "text-slate-300"}`}
            >
              {DIFFICULTY_LABEL[d]}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded ring-1 ring-slate-700">
          {(["realtime", "turn"] as const).map((m) => (
            <button
              key={m}
              disabled={running}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 ${mode === m ? "bg-amber-400 text-slate-950" : "text-slate-300"}`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        {mode === "realtime" && (
          <label className="flex items-center gap-2 text-slate-400">
            敵の行動間隔
            <input
              type="range"
              min={500}
              max={3000}
              step={100}
              value={enemyIntervalMs}
              disabled={running}
              onChange={(e) => setEnemyIntervalMs(Number(e.target.value))}
            />
            <span className="w-14 tabular-nums text-slate-200">{enemyIntervalMs}ms</span>
          </label>
        )}
        <label className="text-slate-400">
          シード{" "}
          <input
            type="number"
            value={seed}
            disabled={running}
            onChange={(e) => setSeed(Number(e.target.value))}
            className="ml-1 w-24 rounded bg-slate-900 px-2 py-1 text-slate-100 ring-1 ring-slate-700"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <span className="text-slate-400">動かす</span>
        {SLOT_IDS.map((id) => (
          <label key={id} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={selected[id]}
              disabled={running}
              onChange={(e) => setSelected((s) => ({ ...s, [id]: e.target.checked }))}
              className="accent-amber-400"
            />
            <span className={ACCENTS[id]}>{SLOTS[id].label}</span>
            {id === "opus" && (
              <select
                value={opusEffort}
                disabled={running}
                onChange={(e) => setOpusEffort(e.target.value as ClaudeEffort)}
                className="ml-1 rounded bg-slate-900 px-1.5 py-0.5 text-slate-100 ring-1 ring-slate-700"
                title="effort"
              >
                {CLAUDE_EFFORTS.map((e) => (
                  <option key={e} value={e}>
                    effort {e}
                  </option>
                ))}
              </select>
            )}
          </label>
        ))}
        {!running && finished.length > 0 && (
          <button
            onClick={() => setLogOpen(true)}
            className="rounded px-3 py-1.5 text-slate-300 ring-1 ring-slate-600 hover:text-white hover:ring-amber-400"
          >
            ログを並べて見る({finished.length}列)
          </button>
        )}
        {running ? (
          <button onClick={stop} className="rounded bg-rose-500 px-4 py-1.5 font-semibold">
            ストップ
          </button>
        ) : (
          <button
            disabled={slots.length === 0}
            onClick={() => {
              setDismissed({});
              setLogOpen(false);
              start({ difficulty, mode, enemyIntervalMs, opusEffort, seed, slots, sandbox });
            }}
            className="rounded bg-amber-400 px-4 py-1.5 font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-40"
          >
            たたかう！
          </button>
        )}
      </div>

      <p className="text-xs text-slate-500">
        {DIFFICULTY_NOTE[difficulty]}
        {mode === "realtime"
          ? `敵は ${enemyIntervalMs}ms ごとに勝手に行動する。判断が速いほど多く動ける。`
          : "勇者と敵が交互に行動する。判断の中身と、考えるのにかかった時間を比べる。"}
        同じシードなら全員が同じ乱数で戦う。動かさなかった列は前回の結果を残す。
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        {SLOT_IDS.map((id) => (
          <ArenaPanel
            key={id}
            slot={id}
            arena={arenas[id]}
            current={current}
            isRunning={runningSlots.includes(id)}
            resultDismissed={dismissed[id] ?? false}
            onDismissResult={() => setDismissed((d) => ({ ...d, [id]: true }))}
          />
        ))}
      </div>

      {logOpen && <LogModal arenas={arenas} slots={finished} onClose={() => setLogOpen(false)} />}
    </div>
  );
}

function sameConditions(a: ArenaConditions, b: ArenaConditions) {
  return (
    a.difficulty === b.difficulty &&
    a.mode === b.mode &&
    a.seed === b.seed &&
    a.sandbox === b.sandbox &&
    (a.mode === "turn" || a.enemyIntervalMs === b.enemyIntervalMs)
  );
}

function ConditionsLine({ arena, current }: { arena: Arena; current: ArenaConditions }) {
  const c = arena.conditions;
  if (!c) return <p className="h-4 text-xs text-slate-600">未実行</p>;
  const differs = !sameConditions(c, current);
  return (
    <p className={`h-4 text-xs ${differs ? "text-amber-400" : "text-slate-500"}`}>
      {differs && "⚠ 今の設定と違う: "}
      {DIFFICULTY_LABEL[c.difficulty]}・{MODE_LABEL[c.mode]}
      {c.mode === "realtime" && `(${c.enemyIntervalMs}ms)`}・シード {c.seed}
      {c.effort && `・effort ${c.effort}`}
      {c.sandbox && "・ダミー"}
    </p>
  );
}

function ArenaPanel(props: {
  slot: SlotId;
  arena: Arena;
  current: ArenaConditions;
  isRunning: boolean;
  resultDismissed: boolean;
  onDismissResult: () => void;
}) {
  const { arena } = props;
  const { hero, enemy, result } = arena.state;
  const last = arena.decisions.at(-1);
  const avg =
    arena.decisions.length > 0
      ? Math.round(arena.decisions.reduce((s, d) => s + d.latencyMs, 0) / arena.decisions.length)
      : null;
  const accentText = ACCENTS[props.slot];

  return (
    <section
      className={`font-dq relative space-y-3 rounded-xl bg-slate-900/60 p-4 ring-1 ${props.isRunning ? "ring-slate-600" : "ring-slate-800"}`}
    >
      <header>
        <div className="flex items-baseline justify-between">
          <h2 className={`text-lg font-bold ${accentText}`}>{SLOTS[props.slot].label}</h2>
          <Elapsed arena={arena} />
        </div>
        <ConditionsLine arena={arena} current={props.current} />
      </header>

      {/* 敵 */}
      <div className="text-center">
        <div className={`text-6xl ${enemy.hp === 0 ? "opacity-20 grayscale" : ""}`}>🐉</div>
        <Bar value={enemy.hp} max={enemy.maxHp} color="bg-rose-500" />
        {arena.state.difficulty === "hard" ? (
          <p className="mt-2 min-h-5 text-xs text-slate-400">
            これまでの行動:{" "}
            {enemy.history.length === 0
              ? "—"
              : enemy.history
                  .slice(-8)
                  .map((m) => ENEMY_MOVES[m].name)
                  .join(" → ")}
          </p>
        ) : (
          <p className="mt-2 min-h-5 text-sm text-slate-300">
            {result ? "" : `${enemy.name}は${ENEMY_MOVES[enemy.next].telegraph.split("(")[0]}`}
          </p>
        )}
      </div>

      {/* 勇者のステータス */}
      <DqWindow>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>ゆうしゃ{hero.defending && <span className="ml-1 text-sky-300">🛡</span>}</span>
          <span className="tabular-nums">
            HP <span className={hero.hp <= 30 ? "text-rose-400" : ""}>{hero.hp}</span>
          </span>
          <span className="tabular-nums">MP {hero.mp}</span>
          <span className="tabular-nums">やくそう {hero.herbs}</span>
        </div>
        <Bar value={hero.hp} max={hero.maxHp} color="bg-emerald-400" />
      </DqWindow>

      {/* 判断 */}
      <DqWindow>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-slate-400">判断</span>
          {arena.thinkingSince !== null ? (
            <ThinkingTimer since={arena.thinkingSince} className={accentText} />
          ) : last ? (
            <span className="tabular-nums">
              {last.latencyMs}
              <span className="text-xs text-slate-400">ms</span>
            </span>
          ) : null}
        </div>
        <div className="mt-1 min-h-6 text-lg">
          {last ? `▶ ${ACTIONS[last.action]?.label ?? last.action}` : "—"}
        </div>
        {last?.probabilities && <Probabilities probs={last.probabilities} />}
        {arena.error && <p className="mt-1 text-xs text-rose-400">{arena.error}</p>}
      </DqWindow>

      {/* ログ */}
      <DqWindow>
        <BattleLog arena={arena} />
      </DqWindow>

      <footer className="flex justify-between text-xs text-slate-400">
        <span>行動回数 {arena.decisions.length}</span>
        <span>平均判断時間 {avg ?? "—"}ms</span>
      </footer>

      {result && !props.resultDismissed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-950/80">
          <p className={`px-2 text-center text-2xl font-bold ${result === "win" ? "text-amber-300" : "text-rose-400"}`}>
            {result === "win" ? "ドラゴンをやっつけた！" : "ゆうしゃは しんでしまった…"}
          </p>
          <p className="text-sm text-slate-300">
            {arena.startedAt !== null && arena.endedAt !== null &&
              `${((arena.endedAt - arena.startedAt) / 1000).toFixed(1)}秒 ・ `}
            行動 {arena.decisions.length}回 ・ 平均判断 {avg ?? "—"}ms
          </p>
          <button
            onClick={props.onDismissResult}
            className="mt-2 rounded px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-600 hover:text-white hover:ring-amber-400"
          >
            閉じてログを見る
          </button>
        </div>
      )}
      {result && props.resultDismissed && (
        <p
          className={`absolute right-4 top-4 rounded px-2 py-0.5 text-xs ${result === "win" ? "bg-amber-400/20 text-amber-300" : "bg-rose-500/20 text-rose-300"}`}
        >
          {result === "win" ? "勝利" : "敗北"}
        </p>
      )}
    </section>
  );
}

/** 決着後に、3列のログを並べて読み返すためのモーダル */
function LogModal(props: { arenas: Record<SlotId, Arena>; slots: SlotId[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between pb-3">
        <h2 className="font-bold">バトルのログ</h2>
        <button
          onClick={props.onClose}
          className="rounded px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-600 hover:text-white hover:ring-amber-400"
        >
          閉じる(Esc)
        </button>
      </header>
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-4 overflow-hidden lg:grid-cols-3">
        {props.slots.map((id) => (
          <LogColumn key={id} slot={id} arena={props.arenas[id]} />
        ))}
      </div>
    </div>
  );
}

function LogColumn({ slot, arena }: { slot: SlotId; arena: Arena }) {
  const avg =
    arena.decisions.length > 0
      ? Math.round(arena.decisions.reduce((s, d) => s + d.latencyMs, 0) / arena.decisions.length)
      : null;
  // 勇者の行動は、記録された判断と同じ順に並ぶので、何手目かを数えて判断時間を突き合わせる
  let heroTurn = -1;

  return (
    <section className="flex min-h-0 flex-col rounded-xl bg-slate-900/60 p-4 ring-1 ring-slate-800">
      <header className="pb-2">
        <h3 className={`font-bold ${ACCENTS[slot]}`}>{SLOTS[slot].label}</h3>
        <p className="text-xs text-slate-400">
          {arena.state.result === "win" ? "勝利" : arena.state.result === "lose" ? "敗北" : "途中"}
          {arena.startedAt !== null && arena.endedAt !== null &&
            ` ・ ${((arena.endedAt - arena.startedAt) / 1000).toFixed(1)}秒`}
          {" ・ "}行動 {arena.decisions.length}回 ・ 平均判断 {avg ?? "—"}ms
        </p>
      </header>
      <div className="font-dq min-h-0 flex-1 overflow-y-auto rounded-lg border-2 border-slate-100 bg-black px-3 py-2 text-sm leading-relaxed">
        <p className="text-slate-500">ドラゴンが あらわれた！</p>
        {arena.log.map((l, i) => {
          if (l.side === "hero") heroTurn += 1;
          const decision = l.side === "hero" ? arena.decisions[heroTurn] : undefined;
          return (
            <p key={i} className={l.side === "enemy" ? "text-rose-300" : ""}>
              {l.text}
              {decision && (
                <span className="ml-2 font-mono text-xs text-slate-500">
                  [{decision.latencyMs}ms
                  {decision.confidence !== undefined && ` / 確信度 ${(decision.confidence * 100).toFixed(0)}%`}]
                </span>
              )}
            </p>
          );
        })}
      </div>
    </section>
  );
}

function DqWindow({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border-2 border-slate-100 bg-black px-3 py-2">{children}</div>;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="mt-1 h-2 w-full rounded bg-slate-800">
      <div
        className={`h-2 rounded transition-all duration-300 ${color}`}
        style={{ width: `${(value / max) * 100}%` }}
      />
    </div>
  );
}

function Probabilities({ probs }: { probs: Record<string, number> }) {
  return (
    <div className="mt-2 space-y-0.5">
      {Object.entries(probs)
        .sort(([, a], [, b]) => b - a)
        .map(([label, p]) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 text-slate-400">
              {ACTIONS[label as HeroAction]?.label ?? label}
            </span>
            <div className="h-1.5 flex-1 rounded bg-slate-800">
              <div className="h-1.5 rounded bg-amber-400" style={{ width: `${p * 100}%` }} />
            </div>
            <span className="w-9 text-right tabular-nums">{(p * 100).toFixed(0)}%</span>
          </div>
        ))}
    </div>
  );
}

function BattleLog({ arena }: { arena: Arena }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [arena.log.length]);
  return (
    <div ref={ref} className="h-32 overflow-y-auto text-sm leading-relaxed">
      {arena.log.length === 0 && <p className="text-slate-500">ドラゴンが あらわれた！</p>}
      {arena.log.map((l, i) => (
        <p key={i} className={l.side === "enemy" ? "text-rose-300" : ""}>
          {l.text}
        </p>
      ))}
    </div>
  );
}

/** 判断待ちの間、経過ミリ秒を毎フレーム更新して見せる */
function ThinkingTimer({ since, className }: { since: number; className: string }) {
  const now = useNow();
  return (
    <span className={`animate-pulse tabular-nums ${className}`}>
      かんがえちゅう… {Math.round(now - since)}
      <span className="text-xs">ms</span>
    </span>
  );
}

function Elapsed({ arena }: { arena: Arena }) {
  const now = useNow(arena.startedAt !== null && arena.endedAt === null);
  if (arena.startedAt === null) return null;
  const end = arena.endedAt ?? now;
  return (
    <span className="font-mono text-sm tabular-nums text-slate-400">
      {((end - arena.startedAt) / 1000).toFixed(1)}s
    </span>
  );
}

function useNow(active = true) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}
