// 模擬面接(appendix)で、フロントと Worker が共有する型と定数
import type { ClaudeEffort, ClaudeModel } from "./decision";

export const INTERVIEW_THEMES = {
  strength: { label: "強み・自己PR", description: "候補者の強みや得意なことを聞く" },
  failure: { label: "失敗経験", description: "失敗から何を学んだかを聞く" },
  team: { label: "チームワーク", description: "意見の対立や協力の経験を聞く" },
  tech: { label: "技術選定", description: "技術を選んだ理由や判断の仕方を聞く" },
} as const;

export type InterviewTheme = keyof typeof INTERVIEW_THEMES;

export interface QuestionRequest {
  theme: InterviewTheme;
  /** 同じ質問を避けるため、すでに出した質問 */
  previous?: string[];
}

export interface QuestionResponse {
  model: string;
  question: string;
  latencyMs: number;
}

export interface FeedbackRequest {
  model?: ClaudeModel;
  effort?: ClaudeEffort;
  question: string;
  answer: string;
  /** Jev の採点を文章にしたもの(講評の参考として渡す) */
  scores: string;
}

export interface FeedbackResponse {
  model: string;
  feedback: string;
  latencyMs: number;
}
