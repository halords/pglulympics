"use client";
import { Suspense, use, useMemo } from "react";
import { useSnapshot } from "../../../lib/data/context";
import { computeStandings, sortStandings } from "../../../lib/standings";
import { manilaDayKey, fmtDayLong } from "../../../lib/format";
import MatchCard from "../../../components/MatchCard";
import StandingsTable from "../../../components/StandingsTable";

const SPORT_NOTES: Record<string, string> = {
  volleyball: "Round-robin brackets, then crossover semifinals, bronze and gold matches.",
  basketball: "Men: two brackets of five, crossover semifinals. Women: four-team round robin, top four to semifinals. Then bronze and gold matches.",
  pickleball: "Nine categories on two courts at Heritage 2500 (Nov 16 & 18). Single round robin per category; 39 & under categories continue to semifinals, third-place and championship matches.",
  badminton: "Nine categories on two courts at Heritage 2500 (Nov 16 & 18). Single round robin per category; 39 & under categories continue to semifinals, third-place and championship matches.",
  bowling: "One-day team event on November 25 — three mixed categories, results by final placement.",
  athletics: "November 9 — nine track & field events, results by final placement.",
  "laro-ng-lahi": "November 9 — five traditional games, results by final placement.",
  "mobile-games": "November 9 — Mobile Legends (all 10 teams) and CODM (6 teams). Fixtures are set by the coordinator in the console.",
  chess: "November 9 — Boys (9 teams) and Girls (2 teams). Fixtures are set by the coordinator in the console.",
};

function SportPageInner({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const snap = useSnapshot();
  const data = useMemo(() => {
    if (!snap) return null;
    const sport = snap.sports.find((s) => s.slug === slug);
    if (!sport) return { sport: null };
    const divisions = snap.divisions.filter((d) => d.sportId === sport.id);
    return { sport, divisions };
  }, [snap, slug]);

  if (!snap || !data) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;
  if (!data.sport) return <p className="py-10 text-center text-neutral-600">Sport not found.</p>;
  const { sport, divisions } = data;

  return (
    <div className="space-y-8">
      <header className="rounded-2xl bg-navy-950 text-white px-5 py-6">
        <p className="text-[11px] uppercase tracking-[0.25em] text-gold-500 font-bold">PGLUlympics</p>
        <h1 className="font-display text-5xl font-bold uppercase">{sport.name}</h1>
        <p className="text-navy-100 mt-1">{divisions.length <= 4 ? `${divisions.map((d) => d.name).join(" · ")} — ` : ""}{SPORT_NOTES[sport.slug] ?? ""}</p>
      </header>

      {divisions.map((div) => {
        const divMatches = snap.matches.filter((m) => m.divisionId === div.id)
          .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
        const groups = snap.groups.filter((g) => g.divisionId === div.id);
        const hasSemis = divMatches.some((m) => m.stage === "semifinal");
        const byDay = new Map<string, typeof divMatches>();
        for (const m of divMatches) {
          const k = manilaDayKey(m.startsAt);
          (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(m);
        }
        const teamNameOf = (tid: string) => snap.teams.find((t) => t.id === tid)?.name ?? "";
        return (
          <section key={div.id} className="space-y-4">
            <h2 className="font-display text-3xl font-bold text-navy-950 border-b-2 border-crimson-800 pb-1">{div.name.toUpperCase()}</h2>

            {div.scoringKind === "placement_only" && (
              <div>
                <h3 className="font-display text-xl font-bold text-navy-800 mb-2">Entrants ({snap.entries.filter((e) => e.divisionId === div.id).length})</h3>
                <div className="flex flex-wrap gap-1.5">
                  {snap.entries.filter((e) => e.divisionId === div.id).map((e) => (
                    <span key={e.id} className="rounded-full bg-white border border-navy-100 px-3 py-1 text-sm font-medium">{teamNameOf(e.teamId)}</span>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 mt-2">Results are decided by final placement — see the event card below once it is finalized.</p>
              </div>
            )}

            {groups.map((g) => {
              const rows = sortStandings(computeStandings(div, snap.entries.filter((e) => e.groupId === g.id), snap.matches, snap.teams));
              return (
                <div key={g.id}>
                  <h3 className="font-display text-xl font-bold text-navy-800 mb-2">{g.name} — Standings</h3>
                  <StandingsTable rows={rows} />
                  {hasSemis && (
                    <p className="text-xs text-neutral-500 mt-1">
                      {groups.length > 1
                        ? "Top 2 of each bracket advance to the semifinals (crossover: A1 vs B2, B1 vs A2)."
                        : "Top 4 advance to the semifinals (1 vs 4, 2 vs 3)."}
                    </p>
                  )}
                </div>
              );
            })}

            {divMatches.length === 0 && div.scoringKind !== "placement_only" && (
              <p className="text-sm text-neutral-500">No fixtures yet — the coordinator will post the schedule here once it is set.</p>
            )}

            <div className="space-y-4">
              {[...byDay.entries()].map(([day, ms]) => (
                <div key={day}>
                  <h3 className="font-display text-lg font-bold text-navy-800 mb-2">{day === "tba" ? "To be scheduled" : fmtDayLong(ms[0].startsAt)}</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {ms.map((m) => <MatchCard key={m.id} match={m} division={div} />)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function SportPage(props: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p className="text-neutral-500 py-10 text-center">Loading…</p>}>
      <SportPageInner {...props} />
    </Suspense>
  );
}
