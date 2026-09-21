import { Hono } from "hono";
import {
  CLAUDE_MODELS,
  type ClaudeModel,
  type DecideRequest,
  type DecideResponse,
  type ErrorResponse,
} from "../shared/decision";
import { decideWithClaude } from "./claude";
import { decideWithJev } from "./jev";

type Bindings = {
  TYPESAFE_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  /** 設定されていれば /api/* に合言葉を要求する */
  DEMO_PASSCODE?: string;
};

const app = new Hono<{ Bindings: Bindings }>().basePath("/api");

app.use("*", async (c, next) => {
  const passcode = c.env.DEMO_PASSCODE;
  if (passcode && c.req.header("x-demo-passcode") !== passcode) {
    return c.json<ErrorResponse>({ error: "合言葉が違います" }, 401);
  }
  await next();
});

app.get("/health", (c) => c.json({ ok: true }));

app.post("/decide", async (c) => {
  const body = await c.req.json<DecideRequest>();
  if (!body?.questions || Object.keys(body.questions).length === 0) {
    return c.json<ErrorResponse>({ error: "questions が空です" }, 400);
  }

  const model: ClaudeModel = CLAUDE_MODELS.includes(body.model as ClaudeModel)
    ? (body.model as ClaudeModel)
    : "claude-haiku-4-5";

  const started = Date.now();
  try {
    const result =
      body.engine === "jev"
        ? await decideWithJev(c.env.TYPESAFE_API_KEY, body.state, body.questions)
        : await decideWithClaude(
            c.env.ANTHROPIC_API_KEY,
            model,
            body.state,
            body.questions,
          );
    return c.json<DecideResponse>({
      engine: body.engine,
      latencyMs: Date.now() - started,
      ...result,
    });
  } catch (err) {
    console.error(`[decide:${body.engine}]`, err);
    const message = err instanceof Error ? err.message : String(err);
    return c.json<ErrorResponse>({ error: message }, 502);
  }
});

export default app;
