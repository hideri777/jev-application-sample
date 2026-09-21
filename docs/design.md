# 設計書

## 技術スタック

| 役割 | 採用 | 理由 |
|---|---|---|
| サーバー | **Hono** | Workers 上でそのまま動き、軽い。Jev・Claude の呼び出しと計測をここに集める |
| フロント | **React + Vite**(SPA)、ルーティングは `react-router` | 画面上で動く処理が中心で SSR は不要 |
| デプロイ先 | **Cloudflare Workers**(静的ファイルも同じ Worker で配信) | `wrangler deploy` 1回で公開できる。無料枠で足りる |
| 開発環境 | `@cloudflare/vite-plugin` | `vite dev` 1つでフロントと Worker が同時に動く |
| スタイル | Tailwind CSS v4 | — |
| DB | なし | デモに不要。必要になったら D1 を足す |

### 採用しなかったもの

- **vinext**: 最初に雛形として入っていたが、0.0.x 系で3日の期限にはリスクが高く、Next.js 互換の利点も要件にないので外した
- **TanStack Start**: SSR やサーバー関数が強みだが、サーバーは Hono が担当するので役割が重なる
- **AWS(S3 + CloudFront + Lambda)**: Hono は Lambda でも動くが、IaC や API Gateway の準備が必要で3日だと重い。業務の AWS との比較はスライドのネタにする
- **Vercel**: 動くが、Hono + Workers のほうが構成が素直

## ディレクトリ構成

```
worker/          Hono の API(Cloudflare Worker のエントリ)
  index.ts       ルーティング・合言葉チェック・計測
  jev.ts         Jev(TypeSafe SDK)呼び出し
  claude.ts      Claude(Anthropic SDK)呼び出し。質問を JSON Schema に変換
shared/
  decision.ts    フロントと Worker で共有する型(質問・回答・API)
src/             React の SPA
  api.ts         /api/decide のクライアント。合言葉は localStorage に保存
  Layout.tsx     ヘッダー・ナビ・合言葉入力
  pages/         Home / Playground / Battle
  battle/        バトルのルール(engine.ts)と進行(useBattle.ts)
docs/            設計書・仕様書
wrangler.jsonc   Worker の設定。/api/* だけ Worker が先に受け、それ以外は SPA を返す
```

tsconfig はフロント用(`tsconfig.app.json`、DOM)と Worker 用(`tsconfig.worker.json`、`worker-configuration.d.ts`)に分けている。

## API 仕様

### `POST /api/decide`

Jev と Claude を**同じ質問形式**で呼ぶ唯一の API。質問の書式は Jev に合わせる。

リクエスト(`DecideRequest`):

```json
{
  "engine": "jev",
  "model": "claude-haiku-4-5",
  "state": { "...": "判断材料" },
  "questions": {
    "action": { "type": "choice", "instructions": "...", "criteria": { "attack": "...", "heal": "..." } },
    "danger": { "type": "score", "instructions": "...", "criteria": ["余裕", "危険", "瀕死"] },
    "finish": { "type": "noul", "instructions": "..." }
  }
}
```

- `engine`: `"jev"` か `"claude"`
- `model`: Claude のときだけ使う。`claude-opus-5` / `claude-sonnet-5` / `claude-haiku-4-5`。省略時は `claude-haiku-4-5`

レスポンス(`DecideResponse`):

```json
{
  "engine": "jev",
  "model": "jev-1.13.0",
  "latencyMs": 243,
  "answers": {
    "action": { "type": "choice", "choice": "heal", "confidence": 0.4, "probabilities": { "heal": 0.4, "attack": 0.2 } },
    "danger": { "type": "score", "score": 2.7, "confidence": 0.7, "probabilities": { "0": 0.01 } },
    "finish": { "type": "noul", "noul": 0.38 }
  },
  "usage": { "input_tokens": 120, "output_tokens": 0 }
}
```

- `latencyMs`: Worker から各 API を呼んで返ってくるまでの時間。フロントはこれとは別にブラウザからの往復時間も測る
- `probabilities` / `confidence` は Jev だけが返す。Claude は値のみで、`noul` は `true`/`false` を 1/0 にして返す
- エラーは `{ "error": "..." }`。上流 API の失敗は 502

### `GET /api/health`

`{ "ok": true }` を返す。

### 合言葉

`DEMO_PASSCODE` が設定されていると、`/api/*` はすべて `x-demo-passcode` ヘッダーが一致しないと 401 を返す。公開 URL で API キーが使われ放題になるのを防ぐための最低限の対策。

## Claude 側の条件の揃え方

公平な比較のため、Claude には Jev と同じ範囲でしか答えられないようにしている。

- 構造化出力(`output_config.format` に JSON Schema)で回答を縛る
  - `choice` → 選択肢のキーの `enum`
  - `score` → `0..n-1` の整数の `enum`
  - `noul` → `boolean`
- 速度比較なので `effort: "low"`(Haiku 4.5 は effort 非対応なので付けない)
- `max_tokens: 1024`、システムプロンプトは「意思決定関数として、指定形式で答える」だけ
- `stop_reason: "refusal"` はエラーとして扱う

## 既知の制約・今後

- レート制限は未実装(合言葉のみ)。公開が長引くなら Workers の Rate Limiting を足す
- Claude の遅延には Anthropic API までのネットワーク時間も含まれる(Jev も同様)
