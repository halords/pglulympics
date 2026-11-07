"use client";
import type { SportInfo } from "../lib/types";

/** Scope picker for the console: "All my sports" + one chip per sport in the
 *  caller's scope. Renders nothing when the scope has fewer than 2 sports
 *  (nothing to switch between). value is a sport id or "all". */
export default function SportSwitcher({ sports, value, onChange }: {
  sports: SportInfo[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (sports.length < 2) return null;
  const cls = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-semibold min-h-[44px] ${active ? "bg-navy-950 text-white" : "bg-white border border-navy-100"}`;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Sport scope">
      <button type="button" className={cls(value === "all")} onClick={() => onChange("all")}>All my sports</button>
      {sports.map((s) => (
        <button key={s.id} type="button" className={cls(value === s.id)} onClick={() => onChange(s.id)}>{s.name}</button>
      ))}
    </div>
  );
}
