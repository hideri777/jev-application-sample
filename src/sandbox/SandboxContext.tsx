import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { StatusResponse } from "../../shared/decision";
import { getPasscode, setPasscode as storePasscode } from "../api";

const STORAGE_KEY = "jev-demo-sandbox";

interface SandboxState {
  /** ダミーモード(API を呼ばない)か */
  enabled: boolean;
  /** ダミーモードから外せない(API キーが無い、または合言葉が未入力) */
  forced: boolean;
  /** 固定されている理由。外せるなら null */
  forcedReason: "no-keys" | "no-passcode" | null;
  status: StatusResponse | null;
  passcode: string;
  setPasscode: (value: string) => void;
  setEnabled: (value: boolean) => void;
}

const SandboxContext = createContext<SandboxState>({
  enabled: true,
  forced: true,
  forcedReason: "no-keys",
  status: null,
  passcode: "",
  setPasscode: () => {},
  setEnabled: () => {},
});

function readStored(): boolean | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

export function SandboxProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [chosen, setChosen] = useState<boolean | null>(readStored);
  const [passcode, setPasscodeState] = useState(getPasscode);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => (r.ok ? (r.json() as Promise<StatusResponse>) : null))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  // キーが無い(クローンしただけの環境)か、合言葉が未入力なら、ダミーモードに固定する。
  // 公開 URL を触った人が、合言葉なしでもそのままデモを試せるようにするため。
  const forcedReason: SandboxState["forcedReason"] =
    status === null || !status.jev || !status.claude
      ? "no-keys"
      : status.passcodeRequired && passcode.trim() === ""
        ? "no-passcode"
        : null;
  const forced = forcedReason !== null;
  const enabled = forced || (chosen ?? false);

  const setPasscode = (value: string) => {
    setPasscodeState(value);
    storePasscode(value);
  };

  const setEnabled = (value: boolean) => {
    setChosen(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // 保存できなくても、このタブの中では切り替わる
    }
  };

  return (
    <SandboxContext.Provider
      value={{ enabled, forced, forcedReason, status, passcode, setPasscode, setEnabled }}
    >
      {children}
    </SandboxContext.Provider>
  );
}

export const useSandbox = () => useContext(SandboxContext);
