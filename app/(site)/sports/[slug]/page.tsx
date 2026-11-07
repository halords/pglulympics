"use client";
import { Suspense, use, useMemo } from "react";
import Link from "next/link";
import { useSnapshot } from "../../../../lib/data/context";
import { isSessionSport } from "../../../../lib/board";
import { computeStandings, sortStandings } from "../../../../lib/standings";
import { manilaDayKey, fmtDayLong } from "../../../../lib/format";
import { nextUpFixtures } from "../../../../lib/schedule";
import MatchCard, { divisionEntrantNames } from "../../../../components/MatchCard";
import StandingsTable from "../../../../components/StandingsTable";
import { sportIdentity, SportIcon } from "../../../../lib/sport-identity";

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

const byStart = (a: { startsAt?: string | null }, b: { startsAt?: string | null }) =>
  (a.startsAt ?? "").localeCompare(b.startsAt ?? "");

function SportPageInner({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const snap = useSnapshot();
  const data = useMemo(() => {
    if (!snap) return null;
    const sport = snap.sports.find((s) => s.slug === slug);
    if (!sport) return { sport: null };
    const divisions = snap.divisions.filter((d) => d.sportId === sport.id);
    const divIds = new Set(divisions.map((d) => d.id));
    const sportMatches = snap.matches.filter((m) => divIds.has(m.divisionId));
    // Standings-first IA: lead block, then this sport's Up Next rail
    // (live pinned, next 6 scheduled), then the full fixture list.
    const upNext = nextUpFixtures(sportMatches, manilaDayKey(new Date().toISOString()), 6);
    return { sport, divisions, upNext };
  }, [snap, slug]);

  if (!snap || !data) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;
  if (!data.sport) return <p className="py-10 text-center text-neutral-600">Sport not found.</p>;
  const { sport, divisions, upNext } = data;
  const teamNameOf = (tid: string) => snap.teams.find((t) => t.id === tid)?.name ?? "";
  const divById = new Map(divisions.map((d) => [d.id, d]));
  const matchesOf = (divisionId: string) => snap.matches.filter((m) => m.divisionId === divisionId).sort(byStart);
  const entriesOf = (divisionId: string) => snap.entries.filter((e) => e.divisionId === divisionId);

  const allPlacement = divisions.length > 0 && divisions.every((d) => d.scoringKind === "placement_only");
  const anyFixtures = divisions.some((d) => matchesOf(d.id).length > 0);
  const leadTitle = allPlacement ? "RESULTS SO FAR" : anyFixtures ? "STANDINGS" : "ENTRANTS";
  // Placement sports: divisions whose event(s) already carry placements.
  const placedDivs = divisions.map((div) => ({
    div,
    events: matchesOf(div.id).filter((m) => (m.placements ?? []).some((p) => p.place != null)),
  }));
  const anyPlacements = placedDivs.some((x) => x.events.length > 0);

  const entrantChips = (divisionId: string) => (
    <div className="flex flex-wrap gap-1.5">
      {entriesOf(divisionId).map((e) => (
        <span key={e.id} className="rounded-full bg-white border border-navy-100 px-3 py-1 text-sm font-medium">{teamNameOf(e.teamId)}</span>
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      <header className="overflow-hidden rounded-2xl bg-navy-950 text-white">
        <div className="h-1.5" style={{ backgroundColor: sportIdentity(sport).tint }} />
        <div className="px-5 py-6">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: sportIdentity(sport).tint }}>
              <SportIcon sport={sport} className="h-10 w-10" />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-crimson-400 font-bold">PGLUlympics</p>
              <h1 className="font-display tracking-tight text-5xl font-bold uppercase">{sport.name}</h1>
            </div>
          </div>
          <p className="text-navy-100 mt-2">{divisions.length <= 4 ? `${divisions.map((d) => d.name).join(" · ")} — ` : ""}{SPORT_NOTES[sport.slug] ?? ""}</p>
        </div>
      </header>

      {/* LEAD: standings first — group tables, latest placements, or entrants. */}
      <section className="space-y-5">
        <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950">{leadTitle}</h2>
        {allPlacement ? (
          anyPlacements ? (
            placedDivs.filter((x) => x.events.length > 0).map(({ div, events }) => (
              <div key={div.id}>
                <h3 className="font-display tracking-tight text-xl font-bold text-navy-800 mb-2">{div.name} — Results</h3>
                <div className="rounded-xl border border-navy-100 bg-white shadow-sm px-4 py-2">
                  {events.map((m) => (
                    <div key={m.id} className="py-1">
                      {events.length > 1 && <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{m.label}</p>}
                      <ul className="divide-y divide-dashed divide-navy-100">
                        {(m.placements ?? []).filter((p) => p.place != null)
                          .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
                          .map((p) => (
                            <li key={p.slotNo} className="flex items-baseline gap-2 py-1 text-[15px]">
                              <span className="font-display tracking-tight font-bold tabular-nums text-crimson-600 w-7 shrink-0">#{p.place}</span>
                              <span className="font-medium text-navy-900">{m.slots[p.slotNo - 1]?.teamName ?? "Entrant"}</span>
                              {p.finish && p.finish !== String(p.place) && <span className="text-xs text-neutral-500">{p.finish}</span>}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-neutral-500">No results yet — placements appear here once events finish.</p>
          )
        ) : (
          divisions.map((div) => {
            const divMatches = matchesOf(div.id);
            const groups = snap.groups.filter((g) => g.divisionId === div.id);
            if (divMatches.length === 0) {
              // Entries-only division (fixtures not set yet): entrants lead.
              if (entriesOf(div.id).length === 0) return null;
              return (
                <div key={div.id}>
                  <h3 className="font-display tracking-tight text-xl font-bold text-navy-800 mb-2">{div.name} — Entrants ({entriesOf(div.id).length})</h3>
                  {entrantChips(div.id)}
                </div>
              );
            }
            if (groups.length === 0) return null;
            const hasSemis = divMatches.some((m) => m.stage === "semifinal");
            return (
              <div key={div.id} className="space-y-4">
                {groups.map((g) => {
                  const rows = sortStandings(computeStandings(div, snap.entries.filter((e) => e.groupId === g.id), snap.matches, snap.teams));
                  return (
                    <div key={g.id}>
                      <h3 className="font-display tracking-tight text-xl font-bold text-navy-800 mb-2">{div.name}{groups.length > 1 ? ` — ${g.name}` : ""} — Standings</h3>
                      <StandingsTable rows={rows} />
                    </div>
                  );
                })}
                {hasSemis && (
                  <p className="text-xs text-neutral-500 -mt-2">
                    {groups.length > 1
                      ? "Top 2 of each bracket advance to the semifinals (crossover: A1 vs B2, B1 vs A2)."
                      : "Top 4 advance to the semifinals (1 vs 4, 2 vs 3)."}
                  </p>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* UP NEXT: this sport's upcoming fixtures, live pinned first. */}
      {(upNext.live.length > 0 || upNext.upcoming.length > 0) && (
        <section>
          <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950 mb-3">UP NEXT</h2>
          {upNext.live.length > 0 && (
            <>
              <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-crimson-600 mb-2"><span className="live-dot h-2 w-2 rounded-full bg-crimson-600 inline-block" /> Live now</p>
              <div className="grid gap-3 sm:grid-cols-2 mb-3">
                {upNext.live.map((m) => <MatchCard key={m.id} match={m} division={divById.get(m.divisionId)} entrants={divisionEntrantNames(snap.entries, snap.teams, m.divisionId)} />)}
              </div>
            </>
          )}
          {upNext.upcoming.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {upNext.upcoming.map((m) => <MatchCard key={m.id} match={m} division={divById.get(m.divisionId)} entrants={divisionEntrantNames(snap.entries, snap.teams, m.divisionId)} />)}
            </div>
          )}
        </section>
      )}

      {/* Full fixtures & results by division. */}
      {divisions.map((div) => {
        const divMatches = matchesOf(div.id);
        const byDay = new Map<string, typeof divMatches>();
        for (const m of divMatches) {
          const k = manilaDayKey(m.startsAt);
          (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(m);
        }
        return (
          <section key={div.id} className="space-y-4">
            <h2 className="font-display tracking-tight text-3xl font-bold text-navy-950 border-b-2 border-crimson-800 pb-1">{div.name.toUpperCase()}</h2>

            {isSessionSport(sport) && (
              <p>
                <Link href={`/board/division/${div.id}`} target="_blank" className="inline-flex min-h-[40px] items-center rounded-lg bg-navy-950 px-3.5 py-2 text-sm font-bold text-white">
                  {div.name} — Teams board ↗
                </Link>
              </p>
            )}

            {div.scoringKind === "placement_only" && (
              <div>
                <h3 className="font-display tracking-tight text-xl font-bold text-navy-800 mb-2">Entrants ({entriesOf(div.id).length})</h3>
                {entrantChips(div.id)}
                <p className="text-xs text-neutral-500 mt-2">Results are decided by final placement — see the event card below once it is finalized.</p>
              </div>
            )}

            {divMatches.length === 0 && div.scoringKind !== "placement_only" && (
              <p className="text-sm text-neutral-500">No fixtures yet — the coordinator will post the schedule here once it is set.</p>
            )}

            <div className="space-y-4">
              {[...byDay.entries()].map(([day, ms]) => (
                <div key={day}>
                  <h3 className="font-display tracking-tight text-lg font-bold text-navy-800 mb-2">{day === "tba" ? "To be scheduled" : fmtDayLong(ms[0].startsAt)}</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {ms.map((m) => <MatchCard key={m.id} match={m} division={div} entrants={divisionEntrantNames(snap.entries, snap.teams, div.id)} />)}
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
