import type { Questions } from "../../shared/decision";

export const DEPARTMENTS = {
  billing: { label: "請求・支払い", description: "請求・支払い・返金・請求書に関する問い合わせ" },
  technical: { label: "技術サポート", description: "アプリやサービスの不具合・エラー・動作がおかしい" },
  account: { label: "アカウント", description: "ログイン・アカウント・パスワード・会員情報" },
  shipping: { label: "配送", description: "商品の配送・届かない・配送状況の確認" },
  other: { label: "その他", description: "上のどれにも当てはまらない一般的な質問" },
} as const;

export type Department = keyof typeof DEPARTMENTS;

export const URGENCY_LEVELS = ["急ぎではない", "通常", "早めの対応が必要", "今すぐ対応が必要"] as const;

export const FORM_QUESTIONS: Questions = {
  department: {
    type: "choice",
    instructions: "この問い合わせを担当すべき部署は？",
    criteria: Object.fromEntries(
      Object.entries(DEPARTMENTS).map(([key, d]) => [key, d.description]),
    ),
  },
  urgency: {
    type: "score",
    instructions: "この問い合わせの緊急度は？",
    criteria: [...URGENCY_LEVELS] as [string, string, ...string[]],
  },
  refund: {
    type: "noul",
    instructions: "問い合わせた人は返金や返品を求めているか？",
  },
  angry: {
    type: "noul",
    instructions: "問い合わせた人は怒っている、または強い不満を持っているか？",
  },
};

/** 自動入力用のサンプル。4つ目は途中で内容が変わり、判定が切り替わる様子を見せる */
export const SAMPLES = [
  {
    title: "二重請求",
    text: "先月の利用料金が二重に引き落とされています。至急返金してください。明日までに対応がなければ解約を考えます。",
  },
  {
    title: "ログイン不可",
    text: "アプリにログインしようとするとエラーコード E-401 が表示されて入れません。パスワードを再設定しても同じです。",
  },
  {
    title: "配送",
    text: "3日前に注文した商品がまだ届きません。配送状況を確認できますか？",
  },
  {
    title: "途中で話が変わる",
    text: "ログインできなくなりました…と思ったら自己解決しました。ついでに、先月分の請求書を再発行してもらえますか？",
  },
];
