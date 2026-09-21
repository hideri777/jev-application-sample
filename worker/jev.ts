import { TypeSafeClient } from "@typesafe-ai/sdk";
import type { Answer, Questions } from "../shared/decision";

export async function decideWithJev(
  apiKey: string,
  state: unknown,
  questions: Questions,
) {
  const client = new TypeSafeClient({ apiKey });
  const res = await client.systemOne({
    state: state as never,
    questions,
  });
  return {
    model: res.model,
    answers: res.answers as Record<string, Answer>,
    usage: res.usage,
  };
}
