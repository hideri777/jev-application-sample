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
  interview.ts   模擬面接の質問づくり・講評(Claude が文章を書く部分)
  triage.ts      一次仕分けのエスカレーション(Claude が最終判断と理由を書く)
shared/
  decision.ts    フロントと Worker で共有する型(質問・回答・API)
  interview.ts   模擬面接の API の型とテーマ
src/             React の SPA
  api.ts         /api/decide のクライアント。合言葉は localStorage に保存
  Layout.tsx     ヘッダー・ナビ・ダミーモードの切り替え・合言葉入力
  slots.ts       画面に並べる判断エンジン(Jev・Claude Haiku 4.5・Claude Opus 5)
  pages/         Home / Playground / Battle / Form
  battle/        バトルのルール(engine.ts)と進行(useBattle.ts)
  form/          フォームの質問・サンプル(questions.ts)
  triage/        一次仕分けのサンプル(samples.ts)と料金の概算(pricing.ts)
  interview/     模擬面接の採点項目・サンプル(rubric.ts)
  live/          入力中に判定し続ける仕組み(useLiveDecision.ts)。フォームと模擬面接で共通
  sandbox/       ダミーモード(API を呼ばずに動く)。docs/sandbox.md 参照
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
- `effort`: Claude のときだけ使う。`low` / `medium` / `high`。省略時は `low`。Haiku 4.5 は非対応なので無視する

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

### `POST /api/triage/escalate`

一次仕分けで Jev が迷った件を Claude に回す。`{ model?, effort?, text, departments }` → `{ model, department, urgency, reason, latencyMs, usage }`。
既定は Opus 5 / effort low。`reason` は振り分けた理由の一文(文章なので Jev にはできない)。詳しくは [triage.md](triage.md)。

### `POST /api/interview/question` / `POST /api/interview/feedback`

模擬面接用。Jev は文章を書けないので、質問と講評は Claude が作る。詳しくは [interview.md](interview.md)。

### `GET /api/status`

`{ "jev": true, "claude": true, "passcodeRequired": true }` のように、キーと合言葉が設定されているかだけを返す(値は返さない)。
合言葉なしで呼べる。フロントはキーが片方でも無ければダミーモードに固定する。

キーが無いまま `/api/decide` を呼ぶと 503 を返す。

### `GET /api/health`

`{ "ok": true }` を返す。

### 合言葉

`DEMO_PASSCODE` が設定されていると、`/api/status` 以外の `/api/*` はすべて `x-demo-passcode` ヘッダーが一致しないと 401 を返す。公開 URL で API キーが使われ放題になるのを防ぐための最低限の対策。

## Claude 側の条件の揃え方

公平な比較のため、Claude には Jev と同じ範囲でしか答えられないようにしている。

- 構造化出力(`output_config.format` に JSON Schema)で回答を縛る
  - `choice` → 選択肢のキーの `enum`
  - `score` → `0..n-1` の整数の `enum`
  - `noul` → `boolean`
- effort はリクエストで指定(既定は速度優先の `low`。むずかしいのバトルでは `medium`)。Haiku 4.5 は effort 非対応なので付けない
- thinking は指定しない(Opus 5 は既定で adaptive thinking。考える量は effort で調整する)
- `max_tokens: 16000`(effort を上げると thinking にトークンを使うため)。システムプロンプトは「意思決定関数として、指定形式で答える」だけ
- `stop_reason` が `refusal` / `max_tokens` のときはエラーとして扱う
- 断られたときに別モデルで答え直すサーバー側フォールバックは**入れていない**(途中でモデルが入れ替わると比較にならないため)

## 既知の制約・今後

- レート制限は未実装(合言葉のみ)。公開が長引くなら Workers の Rate Limiting を足す
- Claude の遅延には Anthropic API までのネットワーク時間も含まれる(Jev も同様)
