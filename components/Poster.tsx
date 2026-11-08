// Downloadable announcement posters (1920×1080), rendered as DOM and
// exported to PNG by the poster pages. Branding is the app's own: arena
// navy, crimson accent, Barlow Condensed display type, and the zebra +
// hairline-grid table treatment from the TV board. Entry matrices render
// a check mark for "entered" — never the source sheet's raw "1".

import type { SportInfo } from "../lib/types";
import type { EntriesPosterData, SchedulePosterDay } from "../lib/posters";
import { sportIdentity, SportIcon } from "../lib/sport-identity";

export const POSTER_W = 1920;
export const POSTER_H = 1080;

function teamTextSize(rowCount: number): string {
  if (rowCount <= 6) return "text-[44px]";
  if (rowCount <= 8) return "text-[40px]";
  if (rowCount <= 10) return "text-[36px]";
  if (rowCount <= 13) return "text-[32px]";
  return "text-[28px]";
}

function PosterShell({
  sport,
  eventName,
  subline,
  children,
}: {
  sport: SportInfo;
  eventName: string;
  subline: string;
  children: React.ReactNode;
}) {
  const identity = sportIdentity(sport);
  return (
    <div className="arena-bg relative flex h-[1080px] w-[1920px] flex-col overflow-hidden text-white">
      <div className="h-2.5 shrink-0 bg-crimson-600" />
      <header className="shrink-0 px-16 pt-10">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-3">
            <span className="inline-block h-4 w-4 bg-crimson-600" />
            <span className="font-display text-[30px] font-bold uppercase tracking-[0.3em]">
              PGLUlympics
            </span>
          </p>
          <p className="font-display text-[24px] font-semibold uppercase tracking-[0.25em] text-navy-100">
            {eventName}
          </p>
        </div>
        <div className="mt-6 flex items-center gap-6">
          <span
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl text-white"
            style={{ backgroundColor: identity.tint }}
          >
            <SportIcon sport={sport} className="h-14 w-14" />
          </span>
          <h1 className="font-display text-[104px] font-bold uppercase leading-none tracking-tight">
            {sport.name}
          </h1>
        </div>
        <p className="mt-5 text-[32px] font-medium text-navy-100">{subline}</p>
        <div className="mt-6 h-px bg-white/15">
          <div className="h-px w-64 bg-crimson-600" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-16 pt-8">{children}</div>

      <footer className="flex shrink-0 items-center justify-between px-16 pb-9 pt-4 text-[21px] text-navy-100">
        <p>Provincial Government of La Union</p>
        <p>
          Live scores &amp; standings ·{" "}
          <span className="font-semibold text-white">pglulympics.vercel.app</span>
        </p>
      </footer>
    </div>
  );
}

const headCell = "px-5 py-3.5 font-display text-[25px] font-semibold uppercase tracking-[0.12em]";

export function SchedulePoster({
  sport,
  eventName,
  day,
}: {
  sport: SportInfo;
  eventName: string;
  day: SchedulePosterDay;
}) {
  const size = teamTextSize(day.rows.length);
  const subline = day.venueLine ? `${day.dateLabel} · ${day.venueLine}` : day.dateLabel;
  return (
    <PosterShell sport={sport} eventName={eventName} subline={subline}>
      <div className="flex min-h-0 flex-1 flex-col border border-white/20">
        <div className="flex shrink-0 items-center bg-crimson-600 text-white">
          <span className={`${headCell} w-60`}>Time</span>
          <span className={`${headCell} w-[380px]`}>Venue</span>
          <span className={`${headCell} w-32 text-center`}>Match</span>
          <span className={`${headCell} w-72`}>Division</span>
          <span className={`${headCell} flex-1`}>Team A</span>
          <span className={`${headCell} flex-1`}>Team B</span>
        </div>
        {day.rows.map((row, i) => (
          <div
            key={row.matchId}
            className={`flex min-h-0 flex-1 items-center border-t border-white/15 ${
              i % 2 === 1 ? "bg-white/5" : ""
            }`}
          >
            <span className="w-60 px-5 font-display text-[30px] font-semibold tabular-nums">
              {row.time}
              {row.status === "live" && (
                <span className="ml-3 inline-flex items-center gap-1.5 align-middle text-[20px] font-bold uppercase tracking-widest text-crimson-400">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-crimson-400" />
                  Live
                </span>
              )}
            </span>
            <span className="w-[380px] px-5 text-[26px] text-navy-100">{row.venue}</span>
            <span className="w-32 px-5 text-center font-display text-[30px] tabular-nums">
              {row.matchNo}
            </span>
            <span className="w-72 px-5 text-[26px] text-navy-100">{row.divisionName}</span>
            <span className={`flex-1 px-5 font-display font-semibold uppercase leading-tight ${size}`}>
              {row.teamA}
              {row.scoreA !== null && row.scoreA !== undefined && (
                <span className="text-navy-100"> · {row.scoreA}</span>
              )}
            </span>
            <span className={`flex-1 px-5 font-display font-semibold uppercase leading-tight ${size}`}>
              {row.teamB}
              {row.scoreB !== null && row.scoreB !== undefined && (
                <span className="text-navy-100"> · {row.scoreB}</span>
              )}
            </span>
          </div>
        ))}
        {day.rows.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-[30px] text-navy-100">
            No matches scheduled this day.
          </div>
        )}
      </div>
    </PosterShell>
  );
}

export function EntriesPoster({
  sport,
  eventName,
  data,
}: {
  sport: SportInfo;
  eventName: string;
  data: EntriesPosterData;
}) {
  const subline = data.venueLine
    ? `Official entries · ${data.venueLine}`
    : "Official entries";
  return (
    <PosterShell sport={sport} eventName={eventName} subline={subline}>
      <div className="flex min-h-0 flex-1 flex-col border border-white/20">
        <div className="flex shrink-0 items-stretch bg-crimson-600 text-white">
          <span className={`${headCell} flex-[1.4]`}>Team</span>
          {data.columns.map((col) => (
            <span key={col} className={`${headCell} flex-1 text-center leading-tight`}>
              {col}
            </span>
          ))}
        </div>
        {data.rows.map((row, i) => (
          <div
            key={row.teamName}
            className={`flex min-h-0 flex-1 items-stretch border-t border-white/15 ${
              i % 2 === 1 ? "bg-white/5" : ""
            }`}
          >
            <span className="flex flex-[1.4] items-center px-5 font-display text-[34px] font-semibold uppercase leading-tight">
              {row.teamName}
            </span>
            {row.entered.map((entered, j) => (
              <span key={j} className="flex flex-1 items-center justify-center">
                {entered ? (
                  <span className="text-[46px] font-bold leading-none text-crimson-400">✓</span>
                ) : (
                  <span className="text-[30px] text-white/25">—</span>
                )}
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="shrink-0 pt-4 text-[22px] text-navy-100">
        ✓ = team entered · {data.enteredCount} entries across {data.rows.length} teams
      </p>
    </PosterShell>
  );
}
