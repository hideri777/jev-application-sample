# Jev 調査メモ

2026-09-21 時点の調査結果。

## 概要

- **TypeSafe AI** が 2026-09-15 にアーリーアクセスを開始した「**System One Model**」の第1弾
- 文章を生成しない。状態(テキストか JSON)と型付きの質問を渡すと、**確率付きの判断**だけを返す
- 名前はカーネマンの「速い思考(System 1)/遅い思考(System 2)」から
- 学習は RLHF ではなく RLCD(Reinforcement Learning for Calibrated Decisions)。確率が較正されている、という主張
- 答えは選択肢の中からしか出ないので、ハルシネーションが構造上起きない(ただし選択肢の中で間違えることはある)

## 性能・料金

- 応答 **70〜500ms**(公式は通常の LLM より 40〜200 倍速いと主張)
- トークンを1つずつ出さず、1回の計算でまとめて答えを出す
- 入力 **$0.042 / 100万トークン**、出力は無料
- 公式の Doom デモ(10回/秒)で約 $7/時間
- レート制限: 250k トークン/秒、1,200 リクエスト/分
- 精度は大型 LLM と同程度という報告(独自ベンチで 67.8%)。推論が要る難しい判断は苦手

## API

`POST https://api.typesafe.ai/v1/systemone`、`Authorization: Bearer <API_KEY>`

```json
{
  "model": "jev-latest",
  "state": { "...": "判断材料(文字列 / オブジェクト / 配列)" },
  "questions": {
    "action": {
      "type": "choice",
      "instructions": "次の行動は？",
      "criteria": { "attack": "通常攻撃", "heal": "回復" }
    }
  }
}
```

| 質問の種類 | 返り値 | 制約 |
|---|---|---|
| `choice` | `choice`・`probabilities`・`confidence` | 選択肢は最大255個 |
| `score` | `score`(段階の間の値もとる)・`probabilities`・`confidence` | 2〜10段階 |
| `noul` | `noul`(Yes の確率 0〜1) | — |

- レスポンスは `{ model: "jev-1.13.0", answers: {...}, usage: {...} }`
- 質問を複数並べても遅延はほぼ増えない
- state は最大 64k トークン。無関係な情報を入れると精度が落ちる
- ストリーミングなし。エラーは 401 / 422 / 429 / 529
- `jev-latest` は予告なく更新される。しきい値を調整するならバージョンを固定する
- SDK: `@typesafe-ai/sdk`(`TypeSafeClient#systemOne`)。グローバル `fetch` を使うので Workers でも動く

## 使うときの注意(公式ガイド・記事より)

- 数を数える・日付計算・算数は苦手 → **計算はコード側で済ませて state に入れる**
- 書いた質問を字義どおりに読む。否定語や範囲の言葉に注意
- 推奨構成は「カスケード」: Jev で安く振り分け → 単純な処理はコード → 難しいものだけ大型 LLM
- ユーザー入力が state に入る場合、答えを操作される可能性がある

## 批判的な意見

- 普通の LLM でも、プレフィルして制約付きで1トークンだけ出させれば近い速さになる(Sean Goedecke)
- 技術的な参入障壁が見えにくい

## 公式デモ

- **Doom**: エンジンの状態(HP・弾・見えている敵)を JSON にして、約10回/秒「次どうする？」を `choice` で聞く。実際のキー操作はローカルのコントローラが担当
- **Wikiracing**: 最大255個のリンクから次に進むリンクを選ぶ

## 出典

- [Introducing System One Models & Jev - TypeSafe AI Blog](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- [API reference - TypeSafe AI](https://docs.typesafe.ai/api)
- [lukaske/jev-doom-agent](https://github.com/lukaske/jev-doom-agent)
- [How to Use Jev - DEV Community](https://dev.to/valyuai/how-to-use-jev-a-practical-guide-to-typesafes-system-one-model-g5e)
- [Jev means structured output is interesting again](https://www.seangoedecke.com/jev-means-structured-output-is-interesting-again/)
- [npaka: 高速な意思決定に特化したAI](https://note.com/npaka/n/n6f8dd30a5fa4)
