import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { getPasscode, setPasscode } from "./api";
import { useSandbox } from "./sandbox/SandboxContext";

const links = [
  { to: "/", label: "トップ" },
  { to: "/playground", label: "Playground" },
  { to: "/battle", label: "バトル" },
  { to: "/form", label: "フォーム" },
];

export function Layout() {
  const [passcode, setPasscodeState] = useState(getPasscode);
  const sandbox = useSandbox();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-bold tracking-wide">⚡ Jev Demo</span>
          <nav className="flex gap-3 text-sm">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) =>
                  isActive ? "text-amber-300" : "text-slate-400 hover:text-slate-200"
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <label
              className={`flex items-center gap-1.5 ${sandbox.forced ? "text-slate-500" : "text-slate-300"}`}
              title={sandbox.forced ? "API キーが設定されていないため、ダミーモードで動いています" : undefined}
            >
              <input
                type="checkbox"
                checked={sandbox.enabled}
                disabled={sandbox.forced}
                onChange={(e) => sandbox.setEnabled(e.target.checked)}
                className="accent-emerald-400"
              />
              ダミーモード
            </label>
            {!sandbox.enabled && sandbox.status?.passcodeRequired && (
              <input
                type="password"
                placeholder="合言葉"
                value={passcode}
                onChange={(e) => {
                  setPasscodeState(e.target.value);
                  setPasscode(e.target.value);
                }}
                className="w-32 rounded bg-slate-900 px-2 py-1 outline-none ring-1 ring-slate-700 focus:ring-amber-400"
              />
            )}
          </div>
        </div>
        {sandbox.enabled && (
          <div className="border-t border-emerald-900/60 bg-emerald-950/40">
            <p className="mx-auto max-w-7xl px-4 py-1.5 text-xs text-emerald-300">
              ダミーモード: API を呼ばず、検証で見えた挙動を再現した事前定義の動きと応答時間で動いています。
              {sandbox.forced && " API キーが未設定のため、このモードに固定しています(README の「APIキーを使う」参照)。"}
            </p>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
