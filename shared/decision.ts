// フロントと Worker で共有する「判断リクエスト」の型。
// 質問の書式は Jev(System One API)に合わせ、Claude 側はこれを JSON Schema に変換して使う。

export type Question =
  | {
      type: "choice";
      instructions: string;
      /** ラベル → 説明 */
      criteria: Record<string, string | null>;
    }
  | {
      type: "score";
      instructions: string;
      /** 0 始まりの段階ごとの説明(2〜10段階) */
      criteria: [string, string, ...string[]];
    }
  | {
      type: "noul";
      instructions: string;
      criteria?: { true?: string; false?: string };
    };

export type Questions = Record<string, Question>;

/** probabilities / confidence は Jev だけが返す(Claude は値のみ) */
export type Answer =
  | {
      type: "choice";
      choice: string;
      confidence?: number;
      probabilities?: Record<string, number>;
    }
  | {
      type: "score";
      score: number;
      confidence?: number;
      probabilities?: Record<string, number>;
    }
  | { type: "noul"; noul: number };

export type Engine = "jev" | "claude";

export const CLAUDE_MODELS = [
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-haiku-4-5",
] as const;
export type ClaudeModel = (typeof CLAUDE_MODELS)[number];

/** Claude がどれだけ考えるか。low は速さ優先、medium / high は考える時間(thinking)を多めに使う */
export const CLAUDE_EFFORTS = ["low", "medium", "high"] as const;
export type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number];

export interface DecideRequest {
  engine: Engine;
  /** Claude のときだけ使う。省略時は claude-haiku-4-5 */
  model?: ClaudeModel;
  /** Claude のときだけ使う。省略時は low。Haiku 4.5 は非対応なので無視する */
  effort?: ClaudeEffort;
  state: unknown;
  questions: Questions;
}

export interface DecideResponse {
  engine: Engine;
  model: string;
  /** Worker から各 API を呼んで返ってくるまでの時間 */
  latencyMs: number;
  answers: Record<string, Answer>;
  usage?: { input_tokens: number; output_tokens: number };
}

export interface ErrorResponse {
  error: string;
}

/** GET /api/status。キーが無ければフロントはダミーモードに固定する */
export interface StatusResponse {
  jev: boolean;
  claude: boolean;
  passcodeRequired: boolean;
}

/** POST /api/triage/escalate: Jev が迷った件を Claude に回す */
export interface EscalateRequest {
  model?: ClaudeModel;
  effort?: ClaudeEffort;
  text: string;
  /** 部署のキー → 説明 */
  departments: Record<string, string>;
}

export interface EscalateResponse {
  model: string;
  department: string;
  urgency: number;
  /** その振り分けにした理由(1文) */
  reason: string;
  latencyMs: number;
  usage: { input_tokens: number; output_tokens: number };
}
