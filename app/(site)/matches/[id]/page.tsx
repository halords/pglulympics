"use client";
import { Suspense, use, useMemo } from "react";
import Link from "next/link";
import { useSnapshot } from "../../../../lib/data/context";
import { setsWon } from "../../../../lib/standings";
import { lineupsForMatch } from "../../../../lib/lineups";
import { fmtDayLong, fmtTime } from "../../../../lib/format";
import { StatusPill, dedupeLabel, divisionEntrantNames } from "../../../../components/MatchCard";

function MatchDetailPageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const snap = useSnapshot();
  const data = useMemo(() => {
    if (!snap) return null;
    const match = snap.matches.find((m) => m.id === decodeURIComponent(id));
    if (!match) return { match: null };
    const division = snap.divisions.find((d) => d.id === match.divisionId);
    const sport = snap.sports.find((s) => s.id === division?.sportId);
    const group = snap.groups.find((g) => g.id === match.groupId);
    return { match, division, sport, group };
  }, [snap, id]);

  if (!snap || !data) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;
  if (!data.match) return <p className="py-10 text-center text-neutral-600">Match not found.</p>;
  const { match, division, sport, group } = data;
  const setsA = setsWon(match, 0);
  const setsB = setsWon(match, 1);
  const isPlacement = division?.scoringKind === "placement_only";
  const entrantChips = [...new Set([
    ...divisionEntrantNames(snap.entries, snap.teams, match.divisionId),
    ...match.slots.map((s) => s.teamName).filter((n): n is string => !!n),
  ])];
  // Lineups: the public_lineups projection when the live snapshot carries
  // it (migration 10), otherwise derived from entries/rosters (mock +
  // signed-in staff). Teams without an encoded roster show the empty
  // state and light up as rosters/imports land.
  const lineupTeams = snap.lineups?.[match.id] ?? lineupsForMatch(snap, match);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="text-sm text-neutral-500">
        <Link href={`/sports/${sport?.slug ?? ""}`} className="underline">{sport?.name}</Link>
        {dedupeLabel([division?.name, group?.name, match.label]) && (
          <span>{" · "}{dedupeLabel([division?.name, group?.name, match.label])}</span>
        )}
      </div>
      <section className="rounded-2xl bg-navy-950 text-white p-5 sm:p-7">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 text-xs uppercase tracking-widest text-navy-100">{fmtDayLong(match.startsAt)} · {fmtTime(match.startsAt)}</span>
          <span className="shrink-0"><StatusPill status={match.status} needsReview={match.needsReview} /></span>
        </div>
        {isPlacement ? (
          <div className="py-3">
            <p className="text-sm uppercase tracking-widest text-navy-100 mb-2">{entrantChips.length} entrant{entrantChips.length === 1 ? "" : "s"} — results by final placement</p>
            {entrantChips.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {entrantChips.map((n) => (
                  <span key={n} className="rounded-full bg-navy-800 border border-navy-700 px-3 py-1 text-sm font-medium">{n}</span>
                ))}
              </div>
            ) : (
              <p className="text-lg font-medium">Entrants to be announced.</p>
            )}
          </div>
        ) : match.slots.length > 2 ? (
          <p className="py-3 text-lg font-medium">{match.slots.length} teams entered — results by final placement below.</p>
        ) : [0, 1].map((i) => {
          const slot = match.slots[i];
          const isWinner = match.status === "final" && match.winnerEntryId && slot?.entryId === match.winnerEntryId;
          return (
            <div key={i} className="flex items-center justify-between gap-3 py-3 border-b border-navy-800 last:border-0">
              <span className={`min-w-0 break-words text-xl sm:text-2xl ${isWinner ? "font-bold" : "font-medium"}`}>
                {slot?.teamName ?? slot?.placeholder ?? "TBD"}
                {isWinner && <span className="ml-2 text-crimson-400 text-base align-middle font-bold">WINNER</span>}
              </span>
              {division?.scoringKind === "set_based" && (match.status === "live" || match.status === "final") && (
                <span className="font-display tracking-tight text-4xl font-bold tabular-nums shrink-0">{i === 0 ? setsA : setsB}</span>
              )}
              {match.totals && <span className="font-display tracking-tight text-4xl font-bold tabular-nums shrink-0">{match.totals[i] ?? 0}</span>}
            </div>
          );
        })}
        <p className="text-sm text-navy-100 pt-2">{match.venue ?? "Venue TBA"}{match.outcome === "forfeit" ? " · decided by forfeit" : ""}{match.outcome === "draw" ? " · draw" : ""}</p>
      </section>

      {lineupTeams.length > 0 && (
        <section>
          <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950 mb-2">LINEUPS</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {lineupTeams.map((team) => (
              <div key={team.entryId ?? team.teamName} className="rounded-xl border border-navy-100 bg-white p-4">
                <h3 className="font-semibold mb-1.5">{team.teamName}</h3>
                {team.players.length > 0 ? (
                  <ul className="text-sm space-y-0.5 list-disc list-inside">
                    {team.players.map((name) => <li key={name}>{name}</li>)}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-500 italic">Roster not yet submitted</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {match.segments.length > 0 && (
        <section>
          <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950 mb-2">{division?.scoringKind === "set_based" ? "SET-BY-SET" : "PERIOD SCORES"}</h2>
          <div className="overflow-x-auto rounded-xl border border-navy-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-800 text-white text-left">
                  <th className="px-3 py-2">Team</th>
                  {match.segments.map((s) => <th key={s.segmentNo} className="px-3 py-2 text-center">{division?.scoringKind === "set_based" ? `Set ${s.segmentNo}` : `P${s.segmentNo}`}</th>)}
                </tr>
              </thead>
              <tbody>
                {[0, 1].map((i) => (
                  <tr key={i} className={i ? "bg-navy-50" : ""}>
                    <td className="px-3 py-2 font-medium">{match.slots[i]?.teamName ?? match.slots[i]?.placeholder ?? "TBD"}</td>
                    {match.segments.map((s) => (
                      <td key={s.segmentNo} className="px-3 py-2 text-center tabular-nums font-semibold">{s.points[i] ?? 0}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {match.placements && match.placements.length > 0 && (
        <section>
          <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950 mb-2">RESULTS</h2>
          <ul className="rounded-xl border border-navy-100 bg-white divide-y divide-navy-100">
            {[...match.placements].sort((a, b) => (a.place ?? 99) - (b.place ?? 99)).map((p) => (
              <li key={p.slotNo} className="px-4 py-2.5 flex justify-between">
                <span className="font-medium">{match.slots[p.slotNo - 1]?.teamName ?? "Entrant"}</span>
                <span className="font-display tracking-tight text-lg font-semibold tabular-nums">{p.place ? `#${p.place}` : p.finish}{p.note ? ` — ${p.note}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm"><Link href="/schedule" className="text-navy-800 underline font-semibold">← Back to schedule</Link></p>
    </div>
  );
}

export default function MatchDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-neutral-500 py-10 text-center">Loading…</p>}>
      <MatchDetailPageInner {...props} />
    </Suspense>
  );
}
