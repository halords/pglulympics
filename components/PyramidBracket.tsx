"use client";
import Link from "next/link";
import type { BracketMatchView, BracketSlot, PyramidBracket as Pyramid } from "../lib/bracket";

// The pyramid (ladder) bracket for single-elimination divisions — Mobile
// Legends and CODM. The final sits at the apex, the opening round is the
// wide base; winners climb, semifinal losers drop into the bronze match,
// and a team left without an opponent in a round shows as a BYE that has
// already advanced and is waiting. Projected rounds (not yet created in
// the console) render dashed with feeder labels ("Winner QF1") and fill
// in with real names as results land — the same pairings the console's
// one-time setup generates. Data comes from lib/bracket (pure view model).

function SlotRow({ slot, board }: { slot: BracketSlot; board: boolean }) {
  const nameCls = board
    ? "text-[clamp(17px,1.9vw,30px)]"
    : "text-[15px]";
  return (
    <div
      className={`flex items-center gap-2 px-3 ${board ? "py-[0.9vh]" : "py-2"} ${
        slot.isWinner ? "bg-white/10" : ""
      }`}
    >
      <span
        className={`h-full w-1 shrink-0 self-stretch rounded ${slot.isWinner ? "bg-crimson-500" : "bg-transparent"}`}
        aria-hidden
      />
      <span
        className={`min-w-0 flex-1 truncate font-display tracking-tight font-bold uppercase leading-tight ${nameCls} ${
          slot.isFeederLabel ? "font-semibold normal-case italic text-navy-200" : slot.isEliminated ? "text-navy-200/50" : "text-white"
        }`}
      >
        {slot.name}
      </span>
      {slot.isBye && (
        <span className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-navy-100">
          Bye
        </span>
      )}
      {slot.isEliminated && (
        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-navy-200/70">
          Out
        </span>
      )}
      {slot.games !== null && (
        <span className={`shrink-0 font-display tracking-tight font-bold tabular-nums ${board ? "text-[clamp(20px,2.4vw,38px)]" : "text-xl"} ${slot.isWinner ? "text-white" : "text-navy-100"}`}>
          {slot.games}
        </span>
      )}
    </div>
  );
}

function MatchCardView({ m, board }: { m: BracketMatchView; board: boolean }) {
  const projected = m.status === "projected";
  const card = (
    <div
      className={`overflow-hidden rounded-xl border ${
        m.status === "live"
          ? "border-crimson-500 bg-navy-900"
          : projected
            ? "border-dashed border-navy-700 bg-navy-950/60"
            : "border-navy-700 bg-navy-900/80"
      } ${board ? "w-[clamp(250px,26vw,430px)]" : "w-[248px] max-w-full"}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
        <span className="font-display tracking-tight text-xs font-bold uppercase tracking-[0.18em] text-navy-100">
          {m.tag}
        </span>
        {m.status === "live" ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-crimson-400">
            <span className="live-dot block h-1.5 w-1.5 rounded-full bg-crimson-500" /> Live
          </span>
        ) : m.status === "final" ? (
          <span className="text-[11px] font-bold uppercase tracking-wider text-navy-200">Final</span>
        ) : projected ? (
          <span className="text-[11px] font-bold uppercase tracking-wider text-navy-300">Projected</span>
        ) : (
          <span className="text-[11px] font-bold uppercase tracking-wider text-navy-200">Best of 3</span>
        )}
      </div>
      <div className="divide-y divide-white/5">
        <SlotRow slot={m.slots[0]} board={board} />
        <SlotRow slot={m.slots[1]} board={board} />
      </div>
    </div>
  );
  return m.matchId && !board ? (
    <Link href={`/matches/${m.matchId}`} className="block transition hover:brightness-125">
      {card}
    </Link>
  ) : (
    card
  );
}

export default function PyramidBracket({
  pyramid,
  variant = "site",
}: {
  pyramid: Pyramid;
  variant?: "site" | "board";
}) {
  const board = variant === "board";
  const apexFirst = [...pyramid.levels].reverse();
  return (
    <div className={board ? "" : "arena-bg overflow-hidden rounded-2xl px-4 py-5 text-white sm:px-6"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={`font-display tracking-tight font-bold uppercase ${board ? "text-[clamp(22px,2.6vw,40px)]" : "text-2xl"}`}>
          The Ladder
        </h3>
        <p className={`font-semibold uppercase tracking-[0.18em] text-navy-100 ${board ? "text-[clamp(12px,1.3vw,20px)]" : "text-[11px]"}`}>
          Single elimination · Best of 3 · Semifinal losers play for bronze
        </p>
      </div>
      {pyramid.projectedOnly && (
        <p className={`mt-1.5 text-navy-100 ${board ? "text-[clamp(13px,1.4vw,21px)]" : "text-sm"}`}>
          Projected from the entry list — pairings become official once the coordinator generates them in the console.
        </p>
      )}

      {pyramid.champion && (
        <div className="mt-4 rounded-xl border border-yellow-300/40 bg-navy-900 px-4 py-3 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-yellow-200">Champions</p>
          <p className={`font-display tracking-tight font-bold uppercase leading-tight ${board ? "text-[clamp(26px,3.4vw,54px)]" : "text-3xl"}`}>
            {pyramid.champion}
          </p>
          <p className="mt-0.5 text-sm text-navy-100">
            {pyramid.runnerUp ? <>Runners-up: {pyramid.runnerUp}</> : null}
            {pyramid.runnerUp && pyramid.thirdPlace ? " · " : null}
            {pyramid.thirdPlace ? <>3rd: {pyramid.thirdPlace}</> : null}
          </p>
        </div>
      )}

      <div className={`flex flex-col ${board ? "gap-[2.2vh] mt-[2vh]" : "gap-6 mt-5"}`}>
        {apexFirst.map((level) => (
          <div key={level.stage}>
            <p className="text-center font-display tracking-tight text-sm font-bold uppercase tracking-[0.3em] text-navy-100">
              {level.title}
            </p>
            <div className="mt-2.5 flex flex-wrap items-stretch justify-center gap-3">
              {level.matches.map((m) => (
                <MatchCardView key={m.tag + (m.matchId ?? "")} m={m} board={board} />
              ))}
              {level.stage === "gold" && pyramid.bronze && (
                <div className="flex flex-col items-center">
                  <MatchCardView m={pyramid.bronze} board={board} />
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-navy-200">
                    Bronze match · 3rd place
                  </p>
                </div>
              )}
            </div>
            {level.waiting.map((w) => (
              <p key={w.name} className="mt-2.5 text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-navy-600 px-3.5 py-1.5 text-sm font-semibold text-navy-100">
                  {w.name}
                  <span className="text-[11px] font-bold uppercase tracking-wider text-navy-200">
                    {w.isBye ? "Bye — advanced, waiting for an opponent" : "Advanced — waiting for an opponent"}
                  </span>
                </span>
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
