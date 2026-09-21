import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { StatusResponse } from "../../shared/decision";

const STORAGE_KEY = "jev-demo-sandbox";

interface SandboxState {
  /** ダミーモード(API を呼ばない)か */
  enabled: boolean;
  /** API キーが無いのでダミーモードから外せない */
  forced: boolean;
  status: StatusResponse | null;
  setEnabled: (value: boolean) => void;
}

const SandboxContext = createContext<SandboxState>({
  enabled: true,
  forced: true,
  status: null,
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

  useEffect(() => {
    fetch("/api/status")
      .then((r) => (r.ok ? (r.json() as Promise<StatusResponse>) : null))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  // キーが片方でも無ければダミーモードに固定する(クローンしただけの環境を想定)
  const forced = status === null || !status.jev || !status.claude;
  const enabled = forced || (chosen ?? false);

  const setEnabled = (value: boolean) => {
    setChosen(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // 保存できなくても、このタブの中では切り替わる
    }
  };

  return (
    <SandboxContext.Provider value={{ enabled, forced, status, setEnabled }}>
      {children}
    </SandboxContext.Provider>
  );
}

export const useSandbox = () => useContext(SandboxContext);
