import { Hono } from "hono";
import {
  CLAUDE_EFFORTS,
  CLAUDE_MODELS,
  type ClaudeEffort,
  type ClaudeModel,
  type DecideRequest,
  type DecideResponse,
  type ErrorResponse,
  type StatusResponse,
} from "../shared/decision";
import { decideWithClaude } from "./claude";
import { decideWithJev } from "./jev";

type Bindings = {
  /** 未設定でも起動できる(フロントはダミーモードになる) */
  TYPESAFE_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  /** 設定されていれば /api/* に合言葉を要求する */
  DEMO_PASSCODE?: string;
};

const app = new Hono<{ Bindings: Bindings }>().basePath("/api");

// キーの有無だけを返す。クローンしただけの環境でもフロントが判断できるよう、合言葉より前に置く
app.get("/status", (c) =>
  c.json<StatusResponse>({
    jev: Boolean(c.env.TYPESAFE_API_KEY),
    claude: Boolean(c.env.ANTHROPIC_API_KEY),
    passcodeRequired: Boolean(c.env.DEMO_PASSCODE),
  }),
);

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
  const effort: ClaudeEffort = CLAUDE_EFFORTS.includes(body.effort as ClaudeEffort)
    ? (body.effort as ClaudeEffort)
    : "low";

  const apiKey = body.engine === "jev" ? c.env.TYPESAFE_API_KEY : c.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return c.json<ErrorResponse>(
      { error: `${body.engine === "jev" ? "TYPESAFE" : "ANTHROPIC"}_API_KEY が未設定です。ダミーモードで試してください` },
      503,
    );
  }

  const started = Date.now();
  try {
    const result =
      body.engine === "jev"
        ? await decideWithJev(apiKey, body.state, body.questions)
        : await decideWithClaude(
            apiKey,
            model,
            effort,
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
