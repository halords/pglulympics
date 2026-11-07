"use client";
import { useMemo } from "react";
import { useSnapshot } from "../../../lib/data/context";
import { computeTally } from "../../../lib/standings";
import TallyTable from "../../../components/TallyTable";

export default function TallyPage() {
  const snap = useSnapshot();
  const rows = useMemo(() => (snap
    ? computeTally(snap.teams, snap.awards, snap.event, (entryId) => snap.entries.find((e) => e.id === entryId)?.teamId)
    : []), [snap]);
  if (!snap) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;
  const decided = snap.awards.filter((a) => a.state === "confirmed");
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display tracking-tight text-4xl font-bold text-navy-950">OVERALL MEDAL TALLY</h1>
        <p className="text-neutral-600 mt-1">Championship standings across all sports. {decided.length} medal{decided.length === 1 ? "" : "s"} confirmed so far.</p>
        <p className="text-sm text-neutral-500 mt-1 tabular-nums">
          Points: <strong>{snap.event.goldPoints}</strong> per gold · <strong>{snap.event.silverPoints}</strong> per silver · <strong>{snap.event.bronzePoints}</strong> per bronze
          {snap.event.pointsProvisional && <span className="ml-2 rounded bg-crimson-100 border border-crimson-600 text-crimson-800 px-1.5 py-0.5 text-xs font-semibold">PROVISIONAL — awaiting organizer confirmation</span>}
        </p>
      </header>
      <TallyTable rows={rows} />
      <section>
        <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950 mb-2">MEDALS BY SPORT</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {snap.sports.map((sp) => {
            const divs = snap.divisions.filter((d) => d.sportId === sp.id);
            const medals = decided.filter((a) => divs.some((d) => d.id === a.divisionId));
            return (
              <div key={sp.id} className="rounded-xl border border-navy-100 bg-white p-4 shadow-sm">
                <h3 className="font-display tracking-tight text-xl font-bold uppercase">{sp.name}</h3>
                {medals.length === 0 ? (
                  <p className="text-sm text-neutral-500 mt-1 tabular-nums">No medals confirmed yet.</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-sm">
                    {medals.map((a) => (
                      <li key={a.awardKey + a.divisionId} className="flex justify-between">
                        <span>{divs.find((d) => d.id === a.divisionId)?.name}</span>
                        <span className="font-semibold">{a.medal === "gold" ? "🥇" : a.medal === "silver" ? "🥈" : "🥉"} {a.teamName ?? ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
