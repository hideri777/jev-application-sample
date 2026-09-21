import type {
  DecideRequest,
  DecideResponse,
  ErrorResponse,
} from "../shared/decision";

const PASSCODE_KEY = "jev-demo-passcode";

export function getPasscode(): string {
  try {
    return localStorage.getItem(PASSCODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPasscode(value: string) {
  try {
    localStorage.setItem(PASSCODE_KEY, value);
  } catch {
    // localStorage が使えない環境では毎回入力してもらう
  }
}

export type DecideResult = DecideResponse & {
  /** ブラウザから見た往復時間(ネットワーク込み) */
  roundTripMs: number;
};

/** API に JSON を POST する。合言葉を付け、エラーは例外にする */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-passcode": getPasscode(),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T | ErrorResponse;
  if (!res.ok || (data !== null && typeof data === "object" && "error" in data)) {
    throw new Error((data as ErrorResponse).error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export async function decide(req: DecideRequest): Promise<DecideResult> {
  const started = performance.now();
  const data = await postJson<DecideResponse>("/api/decide", req);
  return { ...data, roundTripMs: Math.round(performance.now() - started) };
}
