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

export async function decide(req: DecideRequest): Promise<DecideResult> {
  const started = performance.now();
  const res = await fetch("/api/decide", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-passcode": getPasscode(),
    },
    body: JSON.stringify(req),
  });
  const data = (await res.json()) as DecideResponse | ErrorResponse;
  if (!res.ok || "error" in data) {
    throw new Error("error" in data ? data.error : `HTTP ${res.status}`);
  }
  return { ...data, roundTripMs: Math.round(performance.now() - started) };
}
