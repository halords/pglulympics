"use client";
import { Suspense, use } from "react";
import Link from "next/link";
import { useSnapshot } from "../../../lib/data/context";
import { boardContext, boardView, isSessionSport } from "../../../lib/board";
import { sportIdentity, SportIcon } from "../../../lib/sport-identity";
import { fmtDayLong, fmtTime } from "../../../lib/format";
import BoardPresentButton from "../../../components/BoardPresentButton";

// /board/[matchId] — per-game SCOREBOARD SCREEN. A tablet or laptop
// propped up at the court so the PLAYERS can watch the score: one match,
// full viewport, display only. Chromeless (outside the (site) group —
// no nav, no rotation, no ticker, no login). Fed by the same public
// snapshot/realtime feed as /display, so a scorer's tap lands here in
// under a second with no reload. The venue-wide rotating board stays at
// /display; session sports (all teams playing at once) get the division
// teams board at /board/division/[divisionId] instead.

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="arena-bg fixed inset-0 flex flex-col overflow-hidden px-[4vw] py-[3vh] text-white select-none">
      {children}
    </div>
  );
}

function Wordmark() {
  return (
    <p className="font-display tracking-tight text-[clamp(30px,4vw,54px)] font-bold uppercase leading-none">
      PGLU<span className="text-crimson-400">LYMPICS</span>
    </p>
  );
}

function BoardScreen({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params);
  const snap = useSnapshot();

  if (!snap) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center">
          <Wordmark />
          <p className="mt-2 text-[clamp(14px,1.6vw,22px)] uppercase tracking-[0.3em] text-navy-100">Loading the scoreboard…</p>
        </div>
      </Shell>
    );
  }

  const ctx = boardContext(snap, decodeURIComponent(matchId));
  if (!ctx) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Wordmark />
          <p className="mt-[2vh] font-display tracking-tight text-[clamp(28px,3.6vw,52px)] font-bold uppercase">Match not found</p>
          <p className="mt-1 text-[clamp(14px,1.6vw,22px)] text-navy-100">This game isn&apos;t on the board — check the link and try again.</p>
        </div>
      </Shell>
    );
  }

  const { match, division, sport } = ctx;
  const view = boardView(match, division);
  const identity = sportIdentity(sport);
  const score = view.score ?? { a: "0", b: "0" };

  const stateTag = view.state === "live" ? (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-crimson-600 px-[1.1em] py-[0.45em] font-display tracking-tight text-[clamp(14px,1.6vw,26px)] font-bold uppercase">
      <span className="live-dot block h-[0.5em] w-[0.5em] rounded-full bg-white" />Live
    </span>
  ) : view.state === "final" ? (
    <span className="inline-flex shrink-0 items-center rounded-full bg-white px-[1.1em] py-[0.45em] font-display tracking-tight text-[clamp(14px,1.6vw,26px)] font-bold uppercase text-navy-950">Final</span>
  ) : view.state === "cancelled" ? (
    <span className="inline-flex shrink-0 items-center rounded-full bg-navy-800 px-[1.1em] py-[0.45em] font-display tracking-tight text-[clamp(14px,1.6vw,26px)] font-bold uppercase text-navy-100">Cancelled</span>
  ) : null;

  return (
    <Shell>
      {/* header: the SPORT leads (identity icon + tint), category under it */}
      <header>
        <div className="flex items-center gap-[1.2vw]">
          <span className="flex h-[clamp(46px,5vw,84px)] w-[clamp(46px,5vw,84px)] shrink-0 items-center justify-center rounded-[0.9vw] text-white" style={{ backgroundColor: identity.tint }}>
            <SportIcon sport={sport} className="h-[70%] w-[70%]" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display tracking-tight text-[clamp(34px,5.6vw,88px)] font-bold uppercase leading-none">
              {sport?.name ?? "Scoreboard"}
            </h1>
            <p className="mt-[0.6vh] truncate text-[clamp(13px,1.5vw,24px)] font-semibold uppercase tracking-[0.18em] text-navy-100">
              {division?.name} · {match.label}{match.venue ? <> · {match.venue}</> : null}
            </p>
          </div>
          {stateTag}
        </div>
        <div className="mt-[1.2vh] h-[0.5vh] min-h-[3px] w-full rounded-full" style={{ backgroundColor: identity.tint }} />
        {isSessionSport(sport) && division && (
          <div className="mt-[1.2vh]">
            <Link href={`/board/division/${division.id}`} target="_blank" rel="noreferrer"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-navy-700 bg-navy-900/80 px-4 py-1.5 font-display tracking-tight text-[clamp(13px,1.3vw,20px)] font-bold uppercase text-navy-100 hover:bg-navy-800">
              All teams →
            </Link>
          </div>
        )}
      </header>

      {view.kind === "placement" ? (
        <PlacementBody
          label={match.label}
          state={view.state}
          startsAt={match.startsAt}
          entrants={view.entrants}
          rows={view.placementRows}
          hasPlacements={view.hasPlacements}
        />
      ) : view.state === "scheduled" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
          <p className="font-display tracking-tight text-[clamp(30px,4.6vw,76px)] font-bold uppercase leading-[1.02]">{view.teams[0]}</p>
          <p className="my-[1.5vh] font-display tracking-tight text-[clamp(24px,3vw,48px)] font-bold uppercase text-crimson-400">vs</p>
          <p className="font-display tracking-tight text-[clamp(30px,4.6vw,76px)] font-bold uppercase leading-[1.02]">{view.teams[1]}</p>
          <p className="mt-[2.5vh] text-[clamp(16px,1.9vw,30px)] font-semibold uppercase tracking-[0.2em] text-navy-100">
            {match.startsAt ? <>{fmtDayLong(match.startsAt)} · {fmtTime(match.startsAt)}</> : "Date & time to be announced"}
          </p>
          {match.venue && <p className="mt-[0.6vh] text-[clamp(14px,1.6vw,24px)] text-navy-100">{match.venue}</p>}
        </div>
      ) : view.state === "cancelled" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
          <p className="font-display tracking-tight text-[clamp(26px,3.6vw,58px)] font-bold uppercase leading-[1.05]">
            {view.teams[0]} <span className="text-crimson-400">vs</span> {view.teams[1]}
          </p>
          <p className="mt-[2vh] text-[clamp(16px,1.9vw,30px)] font-semibold uppercase tracking-[0.2em] text-navy-100">This match was cancelled</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          {([0, 1] as const).map((side) => {
            const isWinner = view.state === "final" && view.winnerSide === side;
            const dimmed = view.state === "final" && view.winnerSide !== null && view.winnerSide !== side;
            return (
              <div key={side} className={`flex items-center justify-between gap-[3vw] py-[1.2vh] ${side === 0 ? "border-b border-navy-800" : ""}`}>
                <span className={`flex min-w-0 items-center gap-[1vw] font-display tracking-tight text-[clamp(26px,4.4vw,70px)] font-bold uppercase leading-[1.02] ${dimmed ? "text-navy-100/50" : "text-white"}`}>
                  <span className="break-words">{view.teams[side]}</span>
                  {isWinner && (
                    <span className="shrink-0 rounded-full bg-crimson-600 px-[0.7em] py-[0.25em] text-[clamp(12px,1.3vw,22px)] font-bold uppercase text-white">Winner</span>
                  )}
                </span>
                <span className={`shrink-0 font-display tracking-tight text-[clamp(76px,15vw,210px)] font-bold leading-none tabular-nums ${dimmed ? "text-navy-100/50" : "text-white"}`}>
                  {side === 0 ? score.a : score.b}
                </span>
              </div>
            );
          })}
          {view.segments.length > 0 && (
            <div className="mt-[1.6vh] flex flex-wrap justify-center gap-[0.6vw]">
              {view.segments.map((s) => (
                <span key={s.label} className={`rounded-full px-[1em] py-[0.35em] font-display tracking-tight text-[clamp(14px,1.6vw,28px)] font-bold tabular-nums ${s.open ? "bg-crimson-600 text-white" : "bg-navy-800 text-navy-100"}`}>
                  {s.label} {s.a}–{s.b}
                </span>
              ))}
            </div>
          )}
          {view.state === "final" && view.isDraw && (
            <p className="mt-[1.6vh] text-center font-display tracking-tight text-[clamp(18px,2.2vw,36px)] font-bold uppercase text-navy-100">Match drawn</p>
          )}
          {view.state === "final" && match.outcome === "forfeit" && (
            <p className="mt-[1.6vh] text-center text-[clamp(14px,1.6vw,24px)] font-semibold uppercase tracking-[0.2em] text-navy-100">Decided by forfeit</p>
          )}
        </div>
      )}

      <footer className="pt-[1.5vh] text-[clamp(11px,1.1vw,16px)] font-semibold uppercase tracking-[0.25em] text-navy-100/70">
        PGLUlympics · PGLU Sports Fest 2026
      </footer>
      <BoardPresentButton />
    </Shell>
  );
}

function PlacementBody({ label, state, startsAt, entrants, rows, hasPlacements }: {
  label: string;
  state: string;
  startsAt?: string | null;
  entrants: string[];
  rows: { teamName: string; place: number | null; note: string | null }[];
  hasPlacements: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col pt-[2vh]">
      <p className="font-display tracking-tight text-[clamp(28px,4vw,64px)] font-bold uppercase leading-[1.02]">{label}</p>
      <p className="mt-[0.8vh] text-[clamp(14px,1.6vw,24px)] font-semibold uppercase tracking-[0.2em] text-navy-100">
        {state === "live"
          ? "Now competing"
          : state === "final"
            ? (hasPlacements ? "Final results" : "Final")
            : startsAt
              ? <>{fmtDayLong(startsAt)} · {fmtTime(startsAt)}</>
              : "Date & time to be announced"}
      </p>
      {hasPlacements ? (
        <ul className="mt-[2vh] min-h-0 flex-1 space-y-[1vh] overflow-y-auto pr-1">
          {rows.map((r) => (
            <li key={r.teamName} className="flex items-baseline gap-[1.2vw] rounded-[0.8vw] bg-navy-900 px-[1.6vw] py-[1.1vh]">
              <span className={`w-[2.2em] shrink-0 font-display tracking-tight text-[clamp(22px,3vw,48px)] font-bold tabular-nums ${r.place != null ? "text-crimson-400" : "text-navy-100/40"}`}>
                {r.place != null ? `#${r.place}` : "–"}
              </span>
              <span className="min-w-0 flex-1 break-words font-display tracking-tight text-[clamp(20px,2.8vw,44px)] font-bold uppercase leading-[1.05]">{r.teamName}</span>
              {r.note && <span className="shrink-0 text-[clamp(12px,1.3vw,20px)] text-navy-100">{r.note}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-[2vh] min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-[0.8vw]">
            {entrants.map((name) => (
              <span key={name} className="rounded-full border border-navy-700 bg-navy-900 px-[1.2em] py-[0.5em] font-display tracking-tight text-[clamp(16px,2vw,32px)] font-bold uppercase">{name}</span>
            ))}
          </div>
          {state !== "final" && (
            <p className="mt-[2vh] text-[clamp(14px,1.6vw,24px)] text-navy-100">
              {entrants.length} team{entrants.length === 1 ? "" : "s"} entered — results appear here as places are decided.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function BoardPage(props: { params: Promise<{ matchId: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="arena-bg fixed inset-0 flex flex-col items-center justify-center text-white">
          <Wordmark />
          <p className="mt-2 uppercase tracking-[0.3em] text-navy-100">Loading the scoreboard…</p>
        </div>
      }
    >
      <BoardScreen {...props} />
    </Suspense>
  );
}
