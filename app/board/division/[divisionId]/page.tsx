"use client";
import { Suspense, use } from "react";
import Link from "next/link";
import { useSnapshot } from "../../../../lib/data/context";
import { divisionBoard, type TeamBoardRow } from "../../../../lib/board";
import { sportIdentity, SportIcon } from "../../../../lib/sport-identity";
import BoardPresentButton from "../../../../components/BoardPresentButton";

// /board/division/[divisionId] — TEAMS BOARD for ONE division (= one
// game). Session sports like Mobile Games run every team in the same
// area at the same time, so a single-match screen is the wrong form:
// this board lists ALL teams entered in the division with their live
// state — who is playing right now (and the score), and everyone's
// results so far. Boards are strictly per division: Mobile Legends
// (10 teams) and CODM (6 teams) each get their own board; they are
// never merged under a combined "Mobile Games" board. Chromeless and
// display-only like /board/[matchId], on the same realtime snapshot.

function Wordmark() {
  return (
    <p className="font-display tracking-tight text-[clamp(30px,4vw,54px)] font-bold uppercase leading-none">
      PGLU<span className="text-crimson-400">LYMPICS</span>
    </p>
  );
}

function TeamRow({ row }: { row: TeamBoardRow }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block break-words font-display tracking-tight text-[clamp(20px,2.7vw,42px)] font-bold uppercase leading-[1.05]">
          {row.teamName}
        </span>
        {row.state === "live" ? (
          <span className="mt-[0.3vh] block text-[clamp(12px,1.3vw,20px)] font-semibold uppercase tracking-[0.15em] text-navy-100">
            vs {row.liveOpponent} · tap for its scoreboard →
          </span>
        ) : row.state === "played" ? (
          <span className="mt-[0.3vh] block text-[clamp(12px,1.3vw,20px)] font-semibold uppercase tracking-[0.15em] text-navy-100">
            {row.wins}W · {row.losses}L{row.draws > 0 ? ` · ${row.draws}D` : ""}
            {row.lastResult && (
              <> · Last: {row.lastResult.outcome} {row.lastResult.scoreFor}–{row.lastResult.scoreAgainst} vs {row.lastResult.opponent}</>
            )}
          </span>
        ) : (
          <span className="mt-[0.3vh] block text-[clamp(12px,1.3vw,20px)] font-semibold uppercase tracking-[0.15em] text-navy-100/60">
            No matches yet
          </span>
        )}
      </span>
      {row.state === "live" && (
        <span className="flex shrink-0 items-center gap-[1vw]">
          <span className="inline-flex items-center gap-2 rounded-full bg-crimson-600 px-[0.9em] py-[0.35em] font-display tracking-tight text-[clamp(12px,1.3vw,20px)] font-bold uppercase">
            <span className="live-dot block h-[0.5em] w-[0.5em] rounded-full bg-white" />Live
          </span>
          {row.liveScoreFor !== null && (
            <span className="font-display tracking-tight text-[clamp(30px,4vw,64px)] font-bold leading-none tabular-nums">
              {row.liveScoreFor}<span className="text-crimson-400">–</span>{row.liveScoreAgainst}
            </span>
          )}
        </span>
      )}
      {row.state === "played" && (
        <span className="shrink-0 font-display tracking-tight text-[clamp(20px,2.6vw,42px)] font-bold leading-none tabular-nums text-navy-100">
          {row.wins}–{row.losses}{row.draws > 0 ? `–${row.draws}` : ""}
        </span>
      )}
    </>
  );
  const cls = `flex items-center gap-[1.4vw] rounded-[0.8vw] border px-[1.6vw] py-[1.1vh] ${
    row.state === "live" ? "border-crimson-600 bg-navy-900" : "border-navy-800 bg-navy-900/60"
  }`;
  return row.liveMatchId ? (
    <Link href={`/board/${row.liveMatchId}`} className={cls}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function TeamsBoard({ params }: { params: Promise<{ divisionId: string }> }) {
  const { divisionId } = use(params);
  const snap = useSnapshot();

  if (!snap) {
    return (
      <div className="arena-bg fixed inset-0 flex flex-col items-center justify-center px-[4vw] text-white select-none">
        <Wordmark />
        <p className="mt-2 text-[clamp(14px,1.6vw,22px)] uppercase tracking-[0.3em] text-navy-100">Loading the teams board…</p>
      </div>
    );
  }

  const board = divisionBoard(snap, decodeURIComponent(divisionId));
  if (!board) {
    return (
      <div className="arena-bg fixed inset-0 flex flex-col items-center justify-center px-[4vw] text-center text-white select-none">
        <Wordmark />
        <p className="mt-[2vh] font-display tracking-tight text-[clamp(28px,3.6vw,52px)] font-bold uppercase">Division not found</p>
        <p className="mt-1 text-[clamp(14px,1.6vw,22px)] text-navy-100">This teams board doesn&apos;t exist — check the link and try again.</p>
      </div>
    );
  }

  const { division, sport, rows, liveCount } = board;
  const identity = sportIdentity(sport);

  return (
    <div className="arena-bg fixed inset-0 flex flex-col overflow-hidden px-[4vw] py-[3vh] text-white select-none">
      <header>
        <div className="flex items-center gap-[1.2vw]">
          <span className="flex h-[clamp(46px,5vw,84px)] w-[clamp(46px,5vw,84px)] shrink-0 items-center justify-center rounded-[0.9vw] text-white" style={{ backgroundColor: identity.tint }}>
            <SportIcon sport={sport} className="h-[70%] w-[70%]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[clamp(12px,1.3vw,20px)] font-semibold uppercase tracking-[0.25em] text-navy-100">
              {sport?.name} · Teams board
            </p>
            <h1 className="truncate font-display tracking-tight text-[clamp(34px,5.6vw,88px)] font-bold uppercase leading-none">
              {division.name}
            </h1>
          </div>
          {liveCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-crimson-600 px-[1.1em] py-[0.45em] font-display tracking-tight text-[clamp(14px,1.6vw,26px)] font-bold uppercase">
              <span className="live-dot block h-[0.5em] w-[0.5em] rounded-full bg-white" />
              {liveCount} live
            </span>
          )}
        </div>
        <div className="mt-[1.2vh] h-[0.5vh] min-h-[3px] w-full rounded-full" style={{ backgroundColor: identity.tint }} />
        <p className="mt-[1vh] text-[clamp(13px,1.4vw,22px)] font-semibold uppercase tracking-[0.18em] text-navy-100">
          {rows.length} team{rows.length === 1 ? "" : "s"} entered
          {liveCount > 0 ? <> · {liveCount} match{liveCount === 1 ? "" : "es"} in play</> : <> · results update as matches finish</>}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-center font-display tracking-tight text-[clamp(22px,3vw,44px)] font-bold uppercase text-navy-100">
          No teams entered yet
        </p>
      ) : (
        <div className="mt-[2vh] grid min-h-0 flex-1 grid-cols-1 content-start gap-[1vh] overflow-y-auto pr-1 lg:grid-cols-2">
          {rows.map((row) => <TeamRow key={row.entryId} row={row} />)}
        </div>
      )}

      <footer className="pt-[1.5vh] text-[clamp(11px,1.1vw,16px)] font-semibold uppercase tracking-[0.25em] text-navy-100/70">
        PGLUlympics · PGLU Sports Fest 2026
      </footer>
      <BoardPresentButton />
    </div>
  );
}

export default function DivisionBoardPage(props: { params: Promise<{ divisionId: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="arena-bg fixed inset-0 flex flex-col items-center justify-center text-white">
          <Wordmark />
          <p className="mt-2 uppercase tracking-[0.3em] text-navy-100">Loading the teams board…</p>
        </div>
      }
    >
      <TeamsBoard {...props} />
    </Suspense>
  );
}
