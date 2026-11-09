"use client";
import { Suspense, use, useState } from "react";
import Link from "next/link";
import { useProvider, useSnapshot } from "../../../../../lib/data/context";
import { useSession } from "../../../../../lib/data/session";
import { consoleScopeSportIds } from "../../../../../lib/scope";
import { pyramidBracket, type BracketMatchView } from "../../../../../lib/bracket";
import { bracketPool, pairUp, STAGE_TITLES, ELIM_STAGE_ORDER } from "../../../../../lib/fixture-setup";
import { StatusPill } from "../../../../../components/MatchCard";
import type { FixtureInput, MatchStage } from "../../../../../lib/types";

// Ladder console for ONE session division (Mobile Legends / CODM): the
// staff counterpart of the public pyramid. The whole bracket on one
// screen, base round first — generate each round's matches in one click
// (the pairings are the bracketPool draw: winners in the order they won,
// bye teams last), then run each match's score from its scoreboard
// (best-of-3 series taps). Later rounds unlock when the round below is
// fully final, so a pairing can never be generated from undecided
// feeders. Venue is the fixed PHRMDO Lobby, times are unset — the same
// rules as the fixtures form's one-time setup.

function StaffMatchCard({ m }: { m: BracketMatchView }) {
  const projected = m.status === "projected";
  return (
    <div className={`rounded-xl border p-3.5 ${projected ? "border-dashed border-navy-100 bg-navy-50/50" : "border-navy-100 bg-white shadow-sm"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display tracking-tight text-sm font-bold uppercase tracking-wider text-navy-900">{m.tag}</span>
        {m.matchId ? (
          <StatusPill status={m.status === "live" ? "live" : m.status === "final" ? "final" : "scheduled"} />
        ) : (
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Projected</span>
        )}
      </div>
      <div className="mt-2 space-y-1">
        {m.slots.map((s, i) => (
          <p key={i} className="flex items-baseline justify-between gap-2">
            <span className={`min-w-0 truncate font-semibold ${s.isFeederLabel ? "font-medium italic text-neutral-500" : s.isEliminated ? "text-neutral-400" : "text-navy-950"}`}>
              {s.name}
              {s.isBye && <span className="ml-1.5 rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy-800 not-italic">Bye</span>}
              {s.isWinner && <span className="ml-1.5 text-xs font-bold uppercase tracking-wide text-crimson-800">won</span>}
            </span>
            {s.games !== null && <span className="shrink-0 font-display tracking-tight text-xl font-bold tabular-nums text-navy-950">{s.games}</span>}
          </p>
        ))}
      </div>
      {m.matchId && (
        <div className="mt-3 flex gap-2">
          <Link href={`/console/matches/${m.matchId}/scoreboard`} className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-crimson-800 px-3 py-2 text-sm font-bold text-white">
            {m.status === "final" ? "View scoreboard" : "Scoreboard"}
          </Link>
          <Link href={`/console/matches/${m.matchId}`} className="inline-flex min-h-[44px] items-center justify-center rounded-lg border-2 border-navy-100 px-3 py-2 text-sm font-bold text-navy-900">
            Details
          </Link>
        </div>
      )}
    </div>
  );
}

function LadderInner({ params }: { params: Promise<{ divisionId: string }> }) {
  const { divisionId } = use(params);
  const snap = useSnapshot();
  const provider = useProvider();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!session.ready || !snap) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;
  if (!session.role) {
    return (
      <div className="max-w-md mx-auto text-center space-y-3 py-8">
        <h1 className="font-display tracking-tight text-3xl font-bold text-navy-950">LADDER CONSOLE</h1>
        <p className="text-neutral-600">You need a staff account to run the ladder.</p>
        <Link href="/login" className="inline-block rounded-xl bg-crimson-800 text-white px-6 py-3 font-semibold">Go to sign-in</Link>
      </div>
    );
  }
  const division = snap.divisions.find((d) => d.id === decodeURIComponent(divisionId));
  if (!division) return <p className="py-10 text-center text-neutral-600">Division not found.</p>;
  const sport = snap.sports.find((s) => s.id === division.sportId);
  const scopeIds = consoleScopeSportIds(session, snap.sports.map((s) => s.id));
  if (!scopeIds.includes(division.sportId)) {
    return <p className="py-10 text-center text-neutral-600">This division is not in your assigned sports.</p>;
  }

  const pyramid = pyramidBracket(snap, division.id);
  const divEntries = snap.entries.filter((e) => e.divisionId === division.id);
  const teamName = (entryId: string) => {
    const e = snap.entries.find((x) => x.id === entryId);
    return e ? snap.teams.find((t) => t.id === e.teamId)?.name ?? "" : "";
  };
  const lobbyVenue = snap.venues.find((v) => v.name === "PHRMDO Lobby");
  const lobbySubmit = (): { venueId: string | null; venueText: string | null } =>
    lobbyVenue ? { venueId: lobbyVenue.id, venueText: null } : { venueId: null, venueText: "PHRMDO Lobby" };

  /** Generation state for one stage: the pairUp draw over the current
   *  pool, plus whether the round below is fully decided. */
  const genFor = (stage: MatchStage) => {
    const pool = bracketPool(snap.matches, snap.divisions, divEntries, division.id, stage);
    const plan = pairUp(pool);
    const existing = snap.matches.filter((m) => m.divisionId === division.id && m.stage === stage && m.status !== "cancelled").length;
    const stageIdx = ELIM_STAGE_ORDER.indexOf(stage);
    const feedersPending = snap.matches.some(
      (m) => m.divisionId === division.id && m.status !== "cancelled" && m.status !== "final"
        && ELIM_STAGE_ORDER.includes(m.stage) && ELIM_STAGE_ORDER.indexOf(m.stage) < stageIdx,
    );
    return { plan, existing, blocked: stageIdx > 1 && feedersPending };
  };

  const generate = async (stage: MatchStage) => {
    const { plan, existing } = genFor(stage);
    if (plan.pairs.length === 0) return;
    setBusy(true); setNotice(null);
    let created = 0;
    try {
      for (let i = 0; i < plan.pairs.length; i++) {
        const input: FixtureInput = {
          divisionId: division.id, label: `${STAGE_TITLES[stage]} ${existing + i + 1}`, stage,
          groupId: null, startsAt: null, durationMinutes: null,
          ...lobbySubmit(),
          entryIds: [...plan.pairs[i]],
        };
        const res = await provider.createFixture(input);
        if (res.status === "warning") {
          setNotice(`Created ${created} of ${plan.pairs.length} matches, then a check needs your confirmation — finish the rest from the fixtures form.`);
          setBusy(false);
          return;
        }
        created += 1;
      }
      setNotice(
        `Created ${created} ${STAGE_TITLES[stage].toLowerCase()} matches at PHRMDO Lobby` +
        (plan.leftover ? ` · Bye: ${teamName(plan.leftover)} — advances and waits for an opponent.` : "."),
      );
    } catch (e) {
      setNotice(`Created ${created} of ${plan.pairs.length} matches, then failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
    setBusy(false);
  };

  const levelBlock = (stage: MatchStage, title: string, matches: BracketMatchView[], waiting: { name: string; isBye: boolean }[]) => {
    const gen = genFor(stage);
    return (
      <section key={stage} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950">{title}</h2>
          {gen.plan.pairs.length > 0 && (
            gen.blocked ? (
              <span className="text-sm font-medium text-neutral-500">Waiting for the round below to finish before pairing this round.</span>
            ) : (
              <button disabled={busy} onClick={() => void generate(stage)}
                className="rounded-xl bg-navy-900 text-white px-5 py-2.5 font-bold min-h-[48px] disabled:opacity-60">
                Generate {gen.plan.pairs.length} {STAGE_TITLES[stage].toLowerCase()} match{gen.plan.pairs.length === 1 ? "" : "es"}
              </button>
            )
          )}
        </div>
        {gen.plan.pairs.length > 0 && !gen.blocked && (
          <p className="text-sm text-neutral-600">
            Will pair: {gen.plan.pairs.map((p) => `${teamName(p[0])} vs ${teamName(p[1])}`).join(" · ")}
            {gen.plan.leftover ? <> — <strong>Bye: {teamName(gen.plan.leftover)}</strong> (advances, waits)</> : null}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((m) => <StaffMatchCard key={m.tag + (m.matchId ?? "")} m={m} />)}
        </div>
        {waiting.map((w) => (
          <p key={w.name} className="text-sm font-medium text-navy-900">
            {w.name} <span className="text-neutral-500">— {w.isBye ? "bye: already advanced, waiting for an opponent" : "advanced, waiting for an opponent"}</span>
          </p>
        ))}
      </section>
    );
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/console" className="text-sm font-semibold text-navy-800 underline">← Console</Link>
        <span className="flex items-center gap-3">
          <Link href={`/board/division/${division.id}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-navy-800 underline">Teams board ↗</Link>
          <Link href={`/sports/${sport?.slug ?? ""}`} className="text-sm font-semibold text-navy-800 underline">Public page</Link>
        </span>
      </div>

      <header className="overflow-hidden rounded-2xl bg-navy-950 text-white">
        <div className="px-5 py-5">
          <p className="text-[11px] uppercase tracking-[0.25em] text-crimson-400 font-bold">{sport?.name} · Ladder console</p>
          <h1 className="font-display tracking-tight text-4xl font-bold uppercase">{division.name}</h1>
          <p className="mt-1 text-sm text-navy-100">
            Single elimination · best of 3 per match · semifinal losers play the bronze match · a team without an opponent advances on a bye.
            Scores are entered per match on its scoreboard — tap GAME WON as each game ends.
          </p>
          {pyramid?.champion && (
            <p className="mt-2 font-display tracking-tight text-xl font-bold uppercase">
              Champions: <span className="text-yellow-200">{pyramid.champion}</span>
            </p>
          )}
        </div>
      </header>

      {notice && <p className="rounded-lg bg-navy-50 border border-navy-100 px-3 py-2 text-sm">{notice}</p>}

      {!pyramid ? (
        <p className="text-neutral-500">No teams entered in this division yet.</p>
      ) : (
        <>
          {pyramid.levels.map((level) => levelBlock(level.stage, level.title, level.matches, level.waiting))}
          {pyramid.bronze && levelBlock("bronze", "BRONZE MATCH — 3RD PLACE", [pyramid.bronze], [])}
        </>
      )}
    </div>
  );
}

export default function LadderPage(props: { params: Promise<{ divisionId: string }> }) {
  return (
    <Suspense fallback={<p className="text-neutral-500 py-10 text-center">Loading…</p>}>
      <LadderInner {...props} />
    </Suspense>
  );
}
