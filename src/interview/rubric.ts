// 模擬面接で Jev に採点させる項目と、発表用のサンプル
import type { Answer, Questions } from "../../shared/decision";
import type { InterviewTheme } from "../../shared/interview";

export const ANSWERS_LEVELS = ["答えていない", "一部だけ答えている", "おおむね答えている", "的確に答えている"] as const;
export const LOGIC_LEVELS = ["筋道がない", "話が飛んでいる", "筋が通っている", "とても論理的"] as const;

export const TONES = {
  confident: "自信を持って言い切っている",
  neutral: "淡々と話している",
  unsure: "自信がなさそう・あいまいな言い方が多い",
} as const;

/** Jev に聞く質問。1回のリクエストでまとめて聞く */
export const RUBRIC: Questions = {
  answers: {
    type: "score",
    instructions: "回答は、面接官の質問にどれだけ答えているか？",
    criteria: [...ANSWERS_LEVELS] as [string, string, ...string[]],
  },
  conclusionFirst: {
    type: "noul",
    instructions: "回答の最初の1〜2文で、結論(質問への答え)を述べているか？",
  },
  example: {
    type: "noul",
    instructions: "回答に、具体的なエピソード・数字・固有の事例が含まれているか？",
  },
  logic: {
    type: "score",
    instructions: "回答の話の筋道は通っているか？",
    criteria: [...LOGIC_LEVELS] as [string, string, ...string[]],
  },
  tone: {
    type: "choice",
    instructions: "回答の話し方の印象は？",
    criteria: { ...TONES },
  },
};

/** 文字数は計算なので Jev ではなくコードで見る。1分で話せる量(約300字)を目安にする */
export function lengthFeedback(text: string): { label: string; ok: boolean } {
  const n = text.replace(/\s/g, "").length;
  if (n < 100) return { label: `${n}字(短すぎ。1分なら300字前後)`, ok: false };
  if (n > 500) return { label: `${n}字(長すぎ。1分なら300字前後)`, ok: false };
  return { label: `${n}字(ちょうどよい)`, ok: true };
}

/** 講評を書く Claude に渡すため、Jev の採点を文章にする */
export function describeScores(answers: Record<string, Answer> | undefined, text: string): string {
  if (!answers) return `採点なし。文字数: ${lengthFeedback(text).label}`;
  const parts: string[] = [];
  const a = answers.answers;
  if (a?.type === "score") parts.push(`質問への答え: ${ANSWERS_LEVELS[Math.round(a.score)]}`);
  const c = answers.conclusionFirst;
  if (c?.type === "noul") parts.push(`結論から話している: ${c.noul >= 0.5 ? "はい" : "いいえ"}`);
  const e = answers.example;
  if (e?.type === "noul") parts.push(`具体例: ${e.noul >= 0.5 ? "あり" : "なし"}`);
  const l = answers.logic;
  if (l?.type === "score") parts.push(`論理性: ${LOGIC_LEVELS[Math.round(l.score)]}`);
  const t = answers.tone;
  if (t?.type === "choice") parts.push(`話し方: ${TONES[t.choice as keyof typeof TONES] ?? t.choice}`);
  parts.push(`文字数: ${lengthFeedback(text).label}`);
  return parts.join(" / ");
}

/** ダミーモードで出す質問 */
export const QUESTION_BANK: Record<InterviewTheme, string[]> = {
  strength: [
    "あなたの強みを、それが発揮された具体的な場面とあわせて教えてください。",
    "周りの人から、どんな人だとよく言われますか？その理由も教えてください。",
  ],
  failure: [
    "これまでの仕事で一番大きな失敗は何でしたか？そこから何を学びましたか？",
    "うまくいかなかったプロジェクトについて、原因とその後の対応を教えてください。",
  ],
  team: [
    "チームで意見が対立したとき、どのように解決しましたか？",
    "自分とは考え方が違うメンバーと、どう協力して仕事を進めましたか？",
  ],
  tech: [
    "最近の仕事で、技術を選ぶときに何を基準に判断しましたか？",
    "新しい技術を導入するかどうか、どのように決めていますか？",
  ],
};

/** 発表用の自動入力。良い回答と悪い回答で採点がどう変わるかを見せる */
export const SAMPLE_ANSWERS = [
  {
    title: "良い回答",
    text: "私の強みは、問題の原因を最後まで突き止める粘り強さです。前職では、月に数回だけ起きる決済エラーの調査を担当しました。ログを3か月分集めて発生条件を洗い出したところ、特定の時間帯にだけ起きるタイムアウトが原因だと分かりました。設定を見直した結果、エラーはゼロになり、問い合わせも月20件ほど減りました。この経験から、再現しにくい問題ほどデータを集めて仮説を立てることが大事だと学びました。",
  },
  {
    title: "悪い回答",
    text: "えっと、そうですね、強みというか、わりといろいろやるほうだと思います。人と話すのも嫌いではないですし、たぶんコミュニケーションは普通にできるほうかなと。あと、言われたことはちゃんとやるようにしていて、まあ特に大きな問題を起こしたこともないので、そういうところは強みかもしれないです。",
  },
];
