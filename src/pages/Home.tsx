import { Link } from "react-router";

const demos = [
  {
    to: "/playground",
    title: "Playground",
    body: "同じ状態と質問を Jev と Claude に同時に投げて、応答時間と答えを比べる。",
    ready: true,
  },
  {
    to: "/battle",
    title: "ターンバトル",
    body: "ドラクエ風のバトルで、Jev と Claude が同じ敵と戦う。",
    ready: false,
  },
  {
    to: "/form",
    title: "問い合わせフォーム",
    body: "入力している最中に、部署の振り分け・緊急度・返金依頼かをリアルタイム判定。",
    ready: false,
  },
];

export function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Jev — 速い判断のための AI</h1>
        <p className="mt-2 text-slate-400">
          文章を書かずに「判断」だけを 70〜500ms で返す System One Model を、LLM と並べて体感するデモ。
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {demos.map((d) =>
          d.ready ? (
            <Link
              key={d.to}
              to={d.to}
              className="rounded-lg border border-slate-800 p-4 hover:border-amber-400"
            >
              <h2 className="font-semibold">{d.title}</h2>
              <p className="mt-1 text-sm text-slate-400">{d.body}</p>
            </Link>
          ) : (
            <div key={d.to} className="rounded-lg border border-dashed border-slate-800 p-4 opacity-60">
              <h2 className="font-semibold">{d.title}(準備中)</h2>
              <p className="mt-1 text-sm text-slate-400">{d.body}</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
