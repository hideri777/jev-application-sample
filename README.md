# Jev Demo

TypeSafe AI の **Jev**(System One Model)の「判断の速さ」を、Claude と並べて体感するデモアプリ。
社内勉強会(2026-09-26 土)の発表用。

公開URL: https://jev-demo.hh-jev-demo.workers.dev(API を使うには画面右上に合言葉を入れる)

- **Playground**: 同じ状態と質問を Jev と Claude に同時に投げ、応答時間と答えを比べる
- **ターンバトル**: ドラクエ風のバトルで Jev と Claude が同じドラゴンと同時に戦う
- **問い合わせフォーム**(予定): 入力中にリアルタイムで振り分け・緊急度を判定
- **模擬面接**(appendix、余裕があれば): Claude が質問し、Jev が回答を即採点

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/jev.md](docs/jev.md) | Jev の調査メモ(API・特徴・制約・出典) |
| [docs/design.md](docs/design.md) | 技術スタックの選定理由、構成、API 仕様 |
| [docs/battle.md](docs/battle.md) | ターンバトルの仕様とバランス調整の記録 |
| [docs/presentation.md](docs/presentation.md) | 発表の構成案・計測結果・進捗と残タスク |

## 技術スタック

Hono(API)+ React / Vite(SPA)を **Cloudflare Workers** に1つのWorkerとしてデプロイする。
詳しくは [docs/design.md](docs/design.md)。

## セットアップ

Node.js 22 以上。

```bash
npm install
cp .dev.vars.example .dev.vars   # TYPESAFE_API_KEY / ANTHROPIC_API_KEY を記入
npm run dev                      # http://localhost:5173
```

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー(フロントと Worker が同時に動く) |
| `npm run typecheck` | 型チェック(フロント用・Worker用の2設定) |
| `npm run build` | 本番ビルド(`dist/`) |
| `npm run deploy` | ビルドして Cloudflare にデプロイ |
| `npm run cf-typegen` | `wrangler.jsonc` から Worker の型を再生成 |

## デプロイ

初回だけ次の準備が必要。

1. Cloudflare アカウントを作る(無料プランで可)
2. `npx wrangler login` でブラウザからログインする
3. シークレットを登録する(値はプロンプトで入力)
   ```bash
   npx wrangler secret put TYPESAFE_API_KEY
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put DEMO_PASSCODE   # 公開URLで使われ放題にならないよう必ず設定
   ```

4. workers.dev のサブドメインを登録する(ダッシュボードの Workers のオンボーディング、または対話モードの `npm run deploy` で)

以降は `npm run deploy` だけでよい。URL は `https://jev-demo.<アカウントのサブドメイン>.workers.dev`。
合言葉は画面右上の入力欄に入れる(ブラウザに保存される)。

## 環境変数

| 名前 | 用途 |
|---|---|
| `TYPESAFE_API_KEY` | Jev(TypeSafe API)のキー |
| `ANTHROPIC_API_KEY` | Claude API のキー |
| `DEMO_PASSCODE` | 設定すると `/api/*` に `x-demo-passcode` ヘッダーが必要になる |

ローカルは `.dev.vars`(git 管理外)、本番は `wrangler secret put` で登録する。
