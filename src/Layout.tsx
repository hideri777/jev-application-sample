import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { getPasscode, setPasscode } from "./api";

const links = [
  { to: "/", label: "トップ" },
  { to: "/playground", label: "Playground" },
  { to: "/battle", label: "バトル" },
];

export function Layout() {
  const [passcode, setPasscodeState] = useState(getPasscode);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
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
          <input
            type="password"
            placeholder="合言葉"
            value={passcode}
            onChange={(e) => {
              setPasscodeState(e.target.value);
              setPasscode(e.target.value);
            }}
            className="ml-auto w-32 rounded bg-slate-900 px-2 py-1 text-sm outline-none ring-1 ring-slate-700 focus:ring-amber-400"
          />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
