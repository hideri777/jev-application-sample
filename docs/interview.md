# 模擬面接(appendix)仕様

画面は `/interview`。採点項目とサンプルは [src/interview/rubric.ts](../src/interview/rubric.ts)、画面は [src/pages/Interview.tsx](../src/pages/Interview.tsx)、Claude 呼び出しは [worker/interview.ts](../worker/interview.ts)。

## 狙い

「Jev で安く何度も判定 → 難しいところだけ大型 LLM」という**カスケード構成**を、模擬面接で見せる。

| 役割 | 担当 | 理由 |
|---|---|---|
| 質問を作る | Claude Haiku 4.5 | 文章を書くのは Jev にはできない。速さ優先で Haiku |
| 回答中に採点し続ける | Jev | 打つたびに何十回判定しても速くて安い |
| 文字数のチェック | コード | 計算は Jev が苦手なのでコードで |
| 提出後の講評 | Claude Opus 5(effort は画面で選択、既定 low) | 文章で丁寧に書くのは LLM の仕事。重い処理は最後の1回だけ |

## Jev の採点項目

state は `{ 面接官の質問, 候補者の回答 }`。1回のリクエストでまとめて聞く。入力が10文字以上になったら採点を始める(進め方はフォームと同じ `src/live/useLiveDecision.ts`)。

| キー | 種類 | 内容 |
|---|---|---|
| `answers` | `score` | 質問に答えているか: 答えていない / 一部だけ / おおむね / 的確に |
| `conclusionFirst` | `noul` | 最初の1〜2文で結論を述べているか |
| `example` | `noul` | 具体的なエピソード・数字・事例があるか |
| `logic` | `score` | 話の筋道: 筋道がない / 話が飛んでいる / 筋が通っている / とても論理的 |
| `tone` | `choice` | 話し方: 自信を持って言い切っている / 淡々と / 自信がなさそう |

文字数は 100字未満・500字超を「短すぎ・長すぎ」とする(1分で話す量 ≒ 300字が目安)。

## API

### `POST /api/interview/question`

`{ theme, previous? }` → `{ model, question, latencyMs }`。テーマは `strength`(強み)/ `failure`(失敗経験)/ `team`(チームワーク)/ `tech`(技術選定)。Haiku で質問文だけを1〜2文で作る。`previous` の質問とは重ならないようにする。

### `POST /api/interview/feedback`

`{ model?, effort?, question, answer, scores }` → `{ model, feedback, latencyMs }`。既定は Opus 5 / effort low。
`scores` は Jev の採点を文章にしたもの(`describeScores`)で、講評の参考として渡す。講評は「良かった点」「改善点(2つまで)」「書き出し例」の3つで、合計250字程度。

どちらも合言葉が必要。キーが無ければ 503。

## ダミーモード

- 質問: テーマごとに用意した2問から出す(`QUESTION_BANK`)
- 採点: キーワードで判定(「えっと」「たぶん」などのあいまい語、「その結果」などのつなぎ言葉、数字や「前職」などの具体例)
- 講評: 結論と具体例があるかで、2種類のひな形を出し分ける

## 計測結果(本物の API)

テーマ「強み・自己PR」、「良い回答」を入力して提出:

| | 回数 | 時間 |
|---|---|---|
| Claude Haiku(質問) | 1回 | 1.6秒 |
| Jev(採点) | 55回 | 平均 274ms |
| Claude Opus 5 / low(講評) | 1回 | 8.2秒 |

- 良い回答: Jev は「的確に答えている(2.90)/とても論理的(2.94)/結論から 87%/具体例 97%/自信あり」
- 悪い回答(「えっと」「たぶん」だらけ): 「一部だけ答えている(0.74)/話が飛んでいる(0.55)/結論から 13%/具体例 3%/自信がなさそう(確信度 100%)」
- Opus の講評は、規模や役割が見えない点・調査の工夫が伝わらない点を指摘し、書き出し例を示した
