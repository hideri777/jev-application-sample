# CLAUDE.md

Jev(TypeSafe AI の System One Model)と Claude の判断速度を比べる、社内勉強会(2026-09-26)用のデモアプリ。

## まず読むもの

- [README.md](README.md): 概要・セットアップ・デプロイ手順
- [docs/presentation.md](docs/presentation.md): 発表の構成案・計測結果・**進捗と残タスク**
- [docs/design.md](docs/design.md): 技術スタックの理由・構成・API 仕様
- [docs/battle.md](docs/battle.md): ターンバトルの仕様とバランス調整の記録
- [docs/form.md](docs/form.md): 問い合わせフォームの仕様と計測結果
- [docs/jev.md](docs/jev.md): Jev の調査メモ

## 作業の決まり

- 機能や仕様を変えたら、対応する `docs/` と README も更新する。進捗は `docs/presentation.md` のチェックリストに反映する
- 区切りのよいところでコミットする
- API キーは `.dev.vars`(ローカル)と `wrangler secret`(本番)にだけ置く。コードやドキュメントに書かない
- Claude の既定モデルは今は `claude-haiku-4-5`(動作確認用の最安)。変えるときは `worker/index.ts` と `src/pages/*` の初期値を合わせる。バトルの「むずかしい」だけは `claude-opus-5` / effort medium がおすすめ設定(`src/pages/Battle.tsx` の `PRESETS`)
- 変更後は `npm run typecheck` を通す
