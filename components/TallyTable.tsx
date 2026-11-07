"use client";
import type { TallyRow } from "../lib/types";

export default function TallyTable({ rows, compact }: { rows: TallyRow[]; compact?: boolean }) {
  const shown = compact ? rows.slice(0, 5) : rows;
  return (
    <div className="overflow-x-auto rounded-xl border border-navy-100 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-navy-950 text-white text-left">
            <th className="px-3 py-2 w-10">#</th>
            <th className="px-3 py-2">Team</th>
            <th className="px-2 py-2 text-center" title="Gold">🥇</th>
            <th className="px-2 py-2 text-center" title="Silver">🥈</th>
            <th className="px-2 py-2 text-center" title="Bronze">🥉</th>
            <th className="px-3 py-2 text-right">Points</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={r.teamId} className={i % 2 ? "bg-navy-50" : "bg-white"}>
              <td className="px-3 py-2 font-display tracking-tight text-lg font-semibold tabular-nums text-navy-800">{r.points > 0 && r.rank ? r.rank : "—"}</td>
              <td className="px-3 py-2 font-semibold text-navy-950">{r.teamName}</td>
              <td className="px-2 py-2 text-center tabular-nums">{r.gold || "—"}</td>
              <td className="px-2 py-2 text-center tabular-nums">{r.silver || "—"}</td>
              <td className="px-2 py-2 text-center tabular-nums">{r.bronze || "—"}</td>
              <td className="px-3 py-2 text-right font-bold tabular-nums">{r.points}</td>
            </tr>
          ))}
          {shown.length === 0 && (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">No medals awarded yet — the tally fills in as finals are confirmed.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
