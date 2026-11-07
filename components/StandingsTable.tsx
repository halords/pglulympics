"use client";
import type { StandingRow } from "../lib/types";

export default function StandingsTable({ rows }: { rows: StandingRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-navy-100 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-navy-800 text-white text-left">
            <th className="px-3 py-1.5 w-8">#</th>
            <th className="px-3 py-1.5">Team</th>
            <th className="px-2 py-1.5 text-center">P</th>
            <th className="px-2 py-1.5 text-center">W</th>
            <th className="px-2 py-1.5 text-center">L</th>
            <th className="px-2 py-1.5 text-center">Win%</th>
            <th className="px-2 py-1.5 text-center hidden sm:table-cell">Sets</th>
            <th className="px-2 py-1.5 text-center hidden sm:table-cell">Pts ratio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.entryId} className={i < 2 ? "bg-crimson-100/60" : i % 2 ? "bg-navy-50" : "bg-white"}>
              <td className="px-3 py-1.5 font-display tracking-tight text-base font-semibold tabular-nums">{i + 1}</td>
              <td className="px-3 py-1.5 font-medium">{r.teamName}</td>
              <td className="px-2 py-1.5 text-center tabular-nums">{r.played}</td>
              <td className="px-2 py-1.5 text-center tabular-nums font-semibold">{r.wins}</td>
              <td className="px-2 py-1.5 text-center tabular-nums">{r.losses}</td>
              <td className="px-2 py-1.5 text-center tabular-nums">{r.played ? `${r.winPct}%` : "—"}</td>
              <td className="px-2 py-1.5 text-center tabular-nums hidden sm:table-cell">{r.setsWon}:{r.setsLost}</td>
              <td className="px-2 py-1.5 text-center tabular-nums hidden sm:table-cell">{r.pointsFor}:{r.pointsAgainst}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
