"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSnapshot } from "../../lib/data/context";
import { computeTally } from "../../lib/standings";
import { fmtDay, fmtTime, manilaDayKey } from "../../lib/format";
import { nextUpFixtures } from "../../lib/schedule";
import { matchScore } from "../../components/MatchCard";
import { sportIdentity, SportIcon } from "../../lib/sport-identity";
import type { DivisionInfo, MatchInfo, Snapshot, SportInfo } from "../../lib/types";

// /display — venue TV board. Chromeless (lives OUTSIDE the (site) route
// group, so no header/footer/nav), arena-dark, broadcast grammar:
// oversized rank numerals, condensed all-caps team names, crimson slash
// accents, a scorebug live view, a solid-gold champion accent on the
// leader ONLY (medal-literal), and a persistent bottom ticker.
// Views auto-cycle every 15s; ?view=tally|live|upnext|results pins one.
// Manual controls (bottom-right, auto-hiding): pause/play + view jump chips;
// Space pauses/resumes, ←/→ switch views. A pinned board can be unpinned
// into rotation from the controls; ticker + clock never pause.

type ViewKey = "tally" | "live" | "upnext" | "results";
const VIEW_MS = 15_000;
const ALL_VIEWS: ViewKey[] = ["tally", "live", "upnext", "results"];
const VIEW_LABELS: Record<ViewKey, string> = { tally: "Tally", live: "Live", upnext: "Up Next", results: "Results" };

function useClock() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const kick = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(kick); clearInterval(t); };
  }, []);
  return now;
}

/** Three angled crimson bars — the board's signature slash accent. */
function Slashes({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-stretch gap-[0.45em] ${className}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="slash block w-[0.30em] bg-crimson-600" />
      ))}
    </span>
  );
}

function BoardTitle({ title, right }: { title: string; right?: string }) {
  return (
    <div className="flex items-end justify-between gap-6 border-b-4 border-crimson-600 pb-[1.2vh] mb-[1.6vh]">
      <h2 className="flex items-stretch gap-[0.35em] font-display tracking-tight text-[clamp(30px,3.6vw,58px)] font-bold uppercase leading-none">
        <Slashes />
        {title}
      </h2>
      {right && <p className="font-display tracking-tight text-[clamp(16px,1.5vw,26px)] font-semibold uppercase text-navy-100">{right}</p>}
    </div>
  );
}

function LiveBug({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 bg-crimson-600 text-white font-display tracking-tight font-bold uppercase px-[0.55em] py-[0.18em] text-[clamp(15px,1.4vw,24px)] ${className}`}>
      <span className="live-dot block h-[0.5em] w-[0.5em] rounded-full bg-white" />
      Live
    </span>
  );
}

interface Ctx {
  snap: Snapshot;
  divById: Map<string, DivisionInfo>;
  sportByDiv: Map<string, string>;
  sportObjByDiv: Map<string, SportInfo | undefined>;
}
const ctxOf = (snap: Snapshot): Ctx => ({
  snap,
  divById: new Map(snap.divisions.map((d) => [d.id, d])),
  sportByDiv: new Map(snap.divisions.map((d) => [d.id, snap.sports.find((s) => s.id === d.sportId)?.name ?? ""])),
  sportObjByDiv: new Map(snap.divisions.map((d) => [d.id, snap.sports.find((s) => s.id === d.sportId)])),
});

const teamLine = (m: MatchInfo, i: 0 | 1) => m.slots[i]?.teamName ?? m.slots[i]?.placeholder ?? "TBD";

/* ------------------------------ TALLY ------------------------------ */

function MedalDot({ className }: { className: string }) {
  return <span className={`block h-[0.52em] w-[0.52em] rounded-full ${className}`} />;
}

function TallyView({ ctx }: { ctx: Ctx }) {
  const { snap } = ctx;
  const rows = computeTally(snap.teams, snap.awards, snap.event,
    (entryId) => snap.entries.find((e) => e.id === entryId)?.teamId);
  const medalCell = (dot: string, n: number) => (
    <span className="inline-flex items-center gap-[0.35em]">
      <MedalDot className={dot} />
      <span className="tabular-nums">{n}</span>
    </span>
  );
  return (
    <div className="flex h-full flex-col">
      <BoardTitle title="Overall Standings" right={`${snap.event.goldPoints} / ${snap.event.silverPoints} / ${snap.event.bronzePoints} pts per medal`} />
      <div className="flex items-center gap-[1.2vw] px-[1.2vw] pb-[0.8vh] font-display tracking-tight text-[clamp(15px,1.5vw,25px)] font-semibold uppercase text-navy-100">
        <span className="w-[6.5vw]" />
        <span className="flex-1">Team</span>
        <span className="flex w-[17vw] justify-between">
          <span className="inline-flex items-center gap-[0.35em]"><MedalDot className="bg-gold-500" />Gold</span>
          <span className="inline-flex items-center gap-[0.35em]"><MedalDot className="bg-silver-400" />Silver</span>
          <span className="inline-flex items-center gap-[0.35em]"><MedalDot className="bg-bronze-500" />Bronze</span>
        </span>
        <span className="w-[7vw] text-right">Points</span>
      </div>
      <div className="flex flex-1 flex-col justify-between">
        {rows.map((r) => {
          const leader = r.rank === 1 && r.points > 0;
          return (
            <div
              key={r.teamId}
              className={`flex items-center gap-[1.2vw] px-[1.2vw] ${leader ? "bg-navy-900" : ""}`}
              style={leader ? { boxShadow: "inset 10px 0 0 0 var(--color-gold-500)" } : undefined}
            >
              <span className={`w-[6.5vw] shrink-0 font-display tracking-tight font-bold leading-none tabular-nums ${leader ? "text-gold-500 text-[clamp(44px,5.2vw,92px)]" : "text-navy-100 text-[clamp(38px,4.4vw,78px)]"}`}>
                {r.points > 0 ? (r.rank || "–") : "–"}
              </span>
              <span className={`flex-1 truncate font-display tracking-tight font-bold uppercase leading-none ${leader ? "text-[clamp(30px,3.3vw,58px)]" : "text-[clamp(26px,2.9vw,50px)]"}`}>
                {r.teamName}
              </span>
              <span className="flex w-[17vw] justify-between font-display tracking-tight text-[clamp(24px,2.5vw,44px)] font-semibold">
                {medalCell("bg-gold-500", r.gold)}
                {medalCell("bg-silver-400", r.silver)}
                {medalCell("bg-bronze-500", r.bronze)}
              </span>
              <span className={`w-[7vw] shrink-0 text-right font-display tracking-tight font-bold leading-none tabular-nums ${leader ? "text-gold-500 text-[clamp(40px,4.4vw,78px)]" : "text-[clamp(32px,3.6vw,64px)]"}`}>
                {r.points}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ LIVE (scorebug) ------------------------------ */

// Tailored per-sport bug: SPORT NAME big on top (identity icon + tint
// accent), category/division + match label under it, then the teams and the
// score in the sport's own shape (sets strip for rally sports, running total
// for the rest). `featured` scales the same bug up to full-board size.
function Scorebug({ ctx, match, featured = false }: { ctx: Ctx; match: MatchInfo; featured?: boolean }) {
  const division = ctx.divById.get(match.divisionId);
  const sport = ctx.sportObjByDiv.get(match.divisionId);
  const identity = sportIdentity(sport);
  const sportLabel = ctx.sportByDiv.get(match.divisionId) ?? "";
  const score = matchScore(match, division);
  const team = (i: 0 | 1) => match.slots[i]?.teamName ?? match.slots[i]?.placeholder ?? "TBD";
  const header = (
    <>
      <div className="flex items-center gap-[1vw]">
        <span className={`flex shrink-0 items-center justify-center rounded-[0.6vw] text-white ${featured ? "h-[clamp(44px,4.4vw,76px)] w-[clamp(44px,4.4vw,76px)]" : "h-[clamp(30px,3vw,50px)] w-[clamp(30px,3vw,50px)]"}`}
          style={{ backgroundColor: identity.tint }}>
          <SportIcon sport={sport} className="h-[70%] w-[70%]" />
        </span>
        <p className={`font-display tracking-tight font-bold uppercase leading-none text-white ${featured ? "text-[clamp(36px,4.8vw,84px)]" : "text-[clamp(22px,2.6vw,44px)]"}`}>
          {sportLabel}
        </p>
        <span className="ml-auto inline-flex shrink-0 items-center gap-[0.5vw] rounded-full bg-crimson-600 px-[1vw] py-[0.4vh] font-display tracking-tight font-bold uppercase text-[clamp(13px,1.3vw,24px)]">
          <span className="live-dot block h-[0.55vw] w-[0.55vw] min-h-2 min-w-2 rounded-full bg-white" />Live
        </span>
      </div>
      <div className="mt-[0.8vh] h-[0.45vh] min-h-[3px] w-full rounded-full" style={{ backgroundColor: identity.tint }} />
      <p className={`mt-[0.7vh] truncate font-semibold uppercase tracking-[0.18em] text-navy-100 ${featured ? "text-[clamp(16px,1.7vw,30px)]" : "text-[clamp(12px,1.25vw,22px)]"}`}>
        {division?.name} · {match.label}{match.venue ? <> · {match.venue}</> : null}
      </p>
    </>
  );
  if (division?.scoringKind === "placement_only") {
    return (
      <div className={`rounded-[1vw] border border-navy-800 bg-navy-900 ${featured ? "px-[3vw] py-[3vh]" : "px-[2vw] py-[2vh]"}`}>
        {header}
        <p className={`mt-[1.2vh] font-display tracking-tight font-bold uppercase text-white ${featured ? "text-[clamp(34px,4vw,72px)]" : "text-[clamp(26px,3vw,52px)]"}`}>{match.label}</p>
        <p className={`mt-[0.6vh] font-medium text-navy-100 ${featured ? "text-[clamp(20px,2.2vw,38px)]" : "text-[clamp(16px,1.8vw,30px)]"}`}>
          {match.slots.map((s) => s.teamName).filter(Boolean).join("  ·  ")}
        </p>
        <p className="mt-[0.6vh] font-display tracking-tight font-bold uppercase text-crimson-400 text-[clamp(14px,1.5vw,26px)]">Now competing</p>
      </div>
    );
  }
  return (
    <div className={`rounded-[1vw] border border-navy-800 bg-navy-900 ${featured ? "px-[3vw] py-[3vh]" : "px-[2vw] py-[2vh]"}`}>
      {header}
      <div className="mt-[1.4vh] grid grid-cols-[1fr_auto_1fr] items-center gap-[1.5vw]">
        <p className={`font-display tracking-tight font-bold uppercase leading-[1.02] text-white break-words ${featured ? "text-[clamp(44px,5vw,96px)]" : "text-[clamp(30px,3.6vw,64px)]"}`}>{team(0)}</p>
        <p className={`font-display tracking-tight font-bold leading-none tabular-nums text-white ${featured ? "text-[clamp(120px,14vw,240px)]" : "text-[clamp(64px,8.5vw,150px)]"}`}>
          {score ? <>{score.a}<span className="text-crimson-400">–</span>{score.b}</> : "–"}
        </p>
        <p className={`text-right font-display tracking-tight font-bold uppercase leading-[1.02] text-white break-words ${featured ? "text-[clamp(44px,5vw,96px)]" : "text-[clamp(30px,3.6vw,64px)]"}`}>{team(1)}</p>
      </div>
      {match.segments.length > 0 && (
        <div className="mt-[1.2vh] flex flex-wrap justify-center gap-[0.6vw]">
          {match.segments.map((s) => (
            <span key={s.segmentNo} className={`rounded-full px-[0.9vw] py-[0.3vh] font-display tracking-tight font-bold tabular-nums text-[clamp(13px,1.4vw,26px)] ${s.status === "open" ? "bg-crimson-600 text-white" : "bg-navy-800 text-navy-100"}`}>
              {division?.scoringKind === "set_based" ? `S${s.segmentNo}` : `Q${s.segmentNo}`} {s.points[0] ?? 0}–{s.points[1] ?? 0}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Live presentation = MANUAL SLIDESHOW (user direction: no auto-scroll
// marquee, no auto-advance between games). Slides are discrete pages: one
// game at featured size when 1–2 are live; 2×2 pages when 3+ are live. Only
// the operator moves between slides (control cluster, ←/→, game chips). A
// featured game (picker or ?game=) is the slideshow locked to one slide.
function liveSlides(matches: MatchInfo[]): MatchInfo[][] {
  if (matches.length <= 2) return matches.map((m) => [m]);
  const pages: MatchInfo[][] = [];
  for (let i = 0; i < matches.length; i += 4) pages.push(matches.slice(i, i + 4));
  return pages;
}

function LiveView({ ctx, matches, featuredId, slide, slideCount }: {
  ctx: Ctx; matches: MatchInfo[]; featuredId: string | null; slide: number; slideCount: number;
}) {
  const featured = featuredId ? matches.find((m) => m.id === featuredId) : undefined;
  const right = featured
    ? "Featured match"
    : slideCount > 1
      ? `${matches.length} matches in play · slide ${Math.min(slide, slideCount - 1) + 1} of ${slideCount} — use ← → or the game chips`
      : `${matches.length} match${matches.length === 1 ? "" : "es"} in play`;
  return (
    <div className="flex h-full flex-col px-[3vw] pb-[2vh] pt-[6.5vh]">
      <BoardTitle title="Live now" right={right} />
      {featured ? (
        <div className="flex min-h-0 flex-1 items-center">
          <div className="w-full"><Scorebug ctx={ctx} match={featured} featured /></div>
        </div>
      ) : (
        <LiveSlideshow ctx={ctx} matches={matches} slide={slide} />
      )}
    </div>
  );
}

function LiveSlideshow({ ctx, matches, slide }: { ctx: Ctx; matches: MatchInfo[]; slide: number }) {
  const pages = liveSlides(matches);
  const page = pages[Math.min(slide, pages.length - 1)] ?? [];
  if (page.length <= 1) {
    return (
      <div className="flex min-h-0 flex-1 items-center">
        <div className="w-full">{page[0] && <Scorebug ctx={ctx} match={page[0]} featured />}</div>
      </div>
    );
  }
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 content-center gap-[1.2vw]">
      {page.map((m) => <Scorebug key={m.id} ctx={ctx} match={m} />)}
    </div>
  );
}

/* ------------------------------ UP NEXT ------------------------------ */

function UpNextView({ ctx, matches }: { ctx: Ctx; matches: MatchInfo[] }) {
  return (
    <div className="flex h-full flex-col">
      <BoardTitle title="Up Next" right="Coming up at the venues" />
      {matches.length === 0 ? (
        <p className="flex flex-1 items-center justify-center font-display tracking-tight text-[clamp(26px,3vw,50px)] font-bold uppercase text-navy-100">No fixtures remaining on the board</p>
      ) : (
        <div className="flex flex-1 flex-col justify-between">
          {matches.slice(0, 7).map((m) => {
            const division = ctx.divById.get(m.divisionId);
            const placement = division?.scoringKind === "placement_only";
            return (
              <div key={m.id} className="flex items-center gap-[1.6vw] border-b border-navy-800 px-[0.6vw] py-[0.7vh]">
                <span className="w-[5.2em] shrink-0">
                  <span className="block font-display tracking-tight text-[clamp(26px,2.9vw,50px)] font-bold leading-none tabular-nums">{fmtTime(m.startsAt)}</span>
                  <span className="block text-[clamp(13px,1.2vw,20px)] font-semibold uppercase tracking-widest text-navy-100">{fmtDay(m.startsAt)}</span>
                </span>
                <span className="slash block h-[2.6em] w-[0.5em] shrink-0 bg-crimson-600" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display tracking-tight text-[clamp(26px,3vw,52px)] font-bold uppercase leading-[0.95]">
                    {placement
                      ? (division?.name ?? m.label)
                      : <>{teamLine(m, 0)} <span className="text-crimson-400">vs</span> {teamLine(m, 1)}</>}
                  </span>
                  <span className="block text-[clamp(14px,1.35vw,23px)] font-medium uppercase tracking-widest text-navy-100">
                    {[ctx.sportByDiv.get(m.divisionId), placement ? m.label : division?.name, m.venue].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ RESULTS ------------------------------ */

function ResultsView({ ctx, matches }: { ctx: Ctx; matches: MatchInfo[] }) {
  return (
    <div className="flex h-full flex-col">
      <BoardTitle title="Latest Results" right="Final scores" />
      {matches.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-center font-display tracking-tight text-[clamp(26px,3vw,50px)] font-bold uppercase text-navy-100">
          Results appear here<br />as matches finish
        </p>
      ) : (
        <div className="flex flex-1 flex-col justify-between">
          {matches.slice(0, 7).map((m) => {
            const division = ctx.divById.get(m.divisionId);
            const score = matchScore(m, division);
            const placed = (m.placements ?? []).filter((p) => p.place != null).sort((a, b) => (a.place ?? 99) - (b.place ?? 99)).slice(0, 3);
            const winnerIdx = m.winnerEntryId ? m.slots.findIndex((s) => s.entryId === m.winnerEntryId) : -1;
            return (
              <div key={m.id} className="flex items-center gap-[1.6vw] border-b border-navy-800 px-[0.6vw] py-[0.7vh]">
                <span className="shrink-0 bg-navy-800 px-[0.5em] py-[0.2em] font-display tracking-tight text-[clamp(15px,1.45vw,25px)] font-bold uppercase">Final</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display tracking-tight text-[clamp(26px,3vw,52px)] font-bold uppercase leading-[0.95]">
                    {division?.scoringKind === "placement_only"
                      ? (division?.name ?? m.label)
                      : (
                        <>
                          <span className={winnerIdx === 0 ? "text-white" : "text-navy-100"}>{teamLine(m, 0)}</span>
                          <span className="text-crimson-400"> vs </span>
                          <span className={winnerIdx === 1 ? "text-white" : "text-navy-100"}>{teamLine(m, 1)}</span>
                        </>
                      )}
                  </span>
                  <span className="block text-[clamp(14px,1.35vw,23px)] font-medium uppercase tracking-widest text-navy-100">
                    {[ctx.sportByDiv.get(m.divisionId), division?.scoringKind === "placement_only" ? m.label : division?.name, fmtDay(m.startsAt)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {division?.scoringKind === "placement_only" ? (
                  <span className="shrink-0 text-right font-display tracking-tight text-[clamp(19px,1.9vw,33px)] font-semibold leading-tight">
                    {placed.map((p) => (
                      <span key={p.slotNo} className="block"><span className="text-crimson-400 tabular-nums">#{p.place}</span> {m.slots[p.slotNo - 1]?.teamName ?? "Entrant"}</span>
                    ))}
                  </span>
                ) : score ? (
                  <span className="shrink-0 font-display tracking-tight text-[clamp(38px,4.2vw,74px)] font-bold leading-none tabular-nums">
                    {score.a}<span className="text-crimson-400 mx-[0.1em]">–</span>{score.b}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ TICKER ------------------------------ */

function Ticker({ items }: { items: string[] }) {
  const list = items.length > 0 ? items : ["PGLUlympics · Nov 9–26, 2026 · Provincial Government of La Union Sports Fest"];
  const doubled = [...list, ...list];
  return (
    <footer className="relative z-10 border-t-4 border-crimson-600 bg-navy-900">
      <div className="flex items-stretch">
        <span className="z-10 flex shrink-0 items-center bg-crimson-600 px-[1.2vw] font-display tracking-tight text-[clamp(16px,1.6vw,27px)] font-bold uppercase">
          Latest
        </span>
        <div className="relative flex-1 overflow-hidden">
          <div className="ticker-track flex w-max items-center whitespace-nowrap py-[1.1vh]">
            {doubled.map((t, i) => (
              <span key={i} className="flex items-center font-display tracking-tight text-[clamp(18px,1.8vw,31px)] font-semibold uppercase">
                <span className="px-[1.4vw]">{t}</span>
                <span className="slash block h-[1em] w-[0.28em] bg-crimson-600" aria-hidden="true" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------ BOARD ------------------------------ */

const CLOCK_FMT = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
});
const DATE_FMT = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric",
});

function DisplayBoard() {
  const snap = useSnapshot();
  const params = useSearchParams();
  const now = useClock();
  const [cycleIdx, setCycleIdx] = useState(0);
  // Manual control state: `paused` freezes rotation where it is; `manualView`
  // holds a jumped-to view; `unpinned` releases a ?view= pin into rotation.
  const [paused, setPaused] = useState(false);
  const [manualView, setManualView] = useState<ViewKey | null>(null);
  const [unpinned, setUnpinned] = useState(false);
  // Live slideshow position (manual only — never auto-advances) and the
  // featured game picked from the control cluster (a ?game= pin is the
  // URL-borne equivalent and releases the same way, via Rotate).
  const [liveSlide, setLiveSlide] = useState(0);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  // Control cluster visibility: auto-hides after ~3s without mouse movement.
  const [uiVisible, setUiVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);
  const poke = useCallback(() => {
    setUiVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 3000);
  }, []);
  useEffect(() => {
    const kick = window.setTimeout(poke, 0);
    return () => { window.clearTimeout(kick); if (hideTimer.current) window.clearTimeout(hideTimer.current); };
  }, [poke]);

  const data = useMemo(() => {
    if (!snap) return null;
    const ctx = ctxOf(snap);
    const today = manilaDayKey(new Date().toISOString());
    const live = snap.matches.filter((m) => m.status === "live")
      .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
    const { upcoming } = nextUpFixtures(snap.matches, today, 8);
    const results = snap.matches.filter((m) => m.status === "final")
      .sort((a, b) => (b.startsAt ?? "").localeCompare(a.startsAt ?? ""));
    const ticker: string[] = [];
    for (const m of results.slice(0, 6)) {
      const division = ctx.divById.get(m.divisionId);
      const score = matchScore(m, division);
      const sport = ctx.sportByDiv.get(m.divisionId);
      if (division?.scoringKind === "placement_only") {
        const top = (m.placements ?? []).filter((p) => p.place === 1)[0];
        ticker.push(`Final · ${sport} ${division?.name ?? ""} — won by ${top ? (m.slots[top.slotNo - 1]?.teamName ?? "Entrant") : "—"}`);
      } else if (score) {
        ticker.push(`Final · ${sport} — ${teamLine(m, 0)} ${score.a}–${score.b} ${teamLine(m, 1)}`);
      }
    }
    for (const m of upcoming.slice(0, 6)) {
      const division = ctx.divById.get(m.divisionId);
      const sport = ctx.sportByDiv.get(m.divisionId);
      ticker.push(division?.scoringKind === "placement_only"
        ? `Up next · ${sport} ${division?.name ?? ""} — ${fmtDay(m.startsAt)} ${fmtTime(m.startsAt)}`
        : `Up next · ${sport} — ${teamLine(m, 0)} vs ${teamLine(m, 1)} · ${fmtDay(m.startsAt)} ${fmtTime(m.startsAt)}`);
    }
    return { ctx, live, upcoming, results, ticker };
  }, [snap]);

  const views: ViewKey[] = data
    ? ["tally", ...(data.live.length > 0 ? (["live"] as ViewKey[]) : []), "upnext", "results"]
    : ["tally"];

  const pinnedRaw = params.get("view");
  const urlPin: ViewKey | null = (ALL_VIEWS as string[]).includes(pinnedRaw ?? "")
    ? (pinnedRaw as ViewKey)
    : null;
  const gameRaw = params.get("game");
  const gamePin: string | null = !unpinned && gameRaw && data?.live.some((m) => m.id === gameRaw) ? gameRaw : null;
  const pinned: ViewKey | null = gamePin ? "live" : unpinned ? null : urlPin;
  const effFeatured: string | null = featuredId && data?.live.some((m) => m.id === featuredId) ? featuredId : gamePin;
  const slideCount = data ? liveSlides(data.live).length : 0;
  const slideIdx = Math.min(liveSlide, Math.max(0, slideCount - 1));

  const rotating = !pinned && !manualView && !paused;
  useEffect(() => {
    if (!rotating) return;
    const t = setInterval(() => setCycleIdx((i) => i + 1), VIEW_MS);
    return () => clearInterval(t);
  }, [rotating]);

  const shownRaw: ViewKey = manualView ?? pinned ?? views[cycleIdx % views.length];
  const active: ViewKey = shownRaw === "live" && (!data || data.live.length === 0) ? "tally" : shownRaw;

  const jump = (v: ViewKey) => {
    if (v === "live" && (!data || data.live.length === 0)) return;
    if (v !== "live") setFeaturedId(null); // leaving Live releases the feature
    setManualView(v);
    setPaused(false);
    poke();
  };
  const resumeRotation = () => {
    const idx = views.indexOf(active);
    if (idx >= 0) setCycleIdx(idx); // rotation continues from the shown view
    setManualView(null);
    setUnpinned(true);
    setFeaturedId(null);
    setPaused(false);
    poke();
  };
  const togglePlay = () => {
    if (rotating) { setPaused(true); poke(); } else resumeRotation();
  };
  const step = (dir: 1 | -1) => {
    const order = ALL_VIEWS.filter((v) => v !== "live" || (data && data.live.length > 0));
    const i = order.indexOf(active);
    jump(order[(i + dir + order.length) % order.length]);
  };
  // Slideshow paging — wraps around; the ONLY way slides ever change.
  const stepSlide = (dir: 1 | -1) => {
    if (slideCount <= 1) return;
    setLiveSlide((s) => (Math.min(s, slideCount - 1) + dir + slideCount) % slideCount);
    poke();
  };
  const feature = (id: string) => {
    setFeaturedId(id);
    setManualView("live");
    setPaused(false);
    poke();
  };
  // Keyboard control for the laptop driving the TV (no dep array: handlers
  // are re-created every render, so re-subscribe to stay current). On the
  // Live view, ←/→ page the game slideshow; everywhere else they step views.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowRight") { if (active === "live" && !effFeatured && slideCount > 1) stepSlide(1); else step(1); }
      else if (e.key === "ArrowLeft") { if (active === "live" && !effFeatured && slideCount > 1) stepSlide(-1); else step(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!snap || !data) {
    return (
      <div className="arena-bg fixed inset-0 flex flex-col items-center justify-center text-white">
        <p className="font-display tracking-tight text-[clamp(40px,5vw,84px)] font-bold uppercase">
          PGLU<span className="text-crimson-400">LYMPICS</span>
        </p>
        <p className="mt-2 text-[clamp(16px,1.6vw,26px)] uppercase tracking-[0.3em] text-navy-100">Loading the arena…</p>
      </div>
    );
  }

  // now = 0 only until the mount effect ticks — render placeholders then.
  const clockDate = now > 0 ? new Date(now) : null;
  const clock = clockDate ? CLOCK_FMT.format(clockDate) : "--:--:--";
  const dateLine = clockDate ? DATE_FMT.format(clockDate) : "PGLU Sports Fest";

  return (
    <div className={`arena-bg fixed inset-0 flex flex-col overflow-hidden text-white select-none ${uiVisible ? "" : "cursor-none"}`}
      onMouseMove={poke} onTouchStart={poke}>
      {/* persistent top bar: event identity + live clock */}
      <header className="flex items-start justify-between gap-6 px-[3vw] pt-[2vh]">
        <div>
          <p className="font-display tracking-tight text-[clamp(34px,4vw,68px)] font-bold uppercase leading-none">
            PGLU<span className="text-crimson-400">LYMPICS</span>
          </p>
          <p className="mt-[0.5vh] text-[clamp(13px,1.25vw,21px)] font-semibold uppercase tracking-[0.25em] text-navy-100">
            PGLU Sports Fest · Nov 9–26, 2026
          </p>
        </div>
        <div className="text-right">
          <p className="font-display tracking-tight text-[clamp(30px,3.4vw,58px)] font-bold leading-none tabular-nums">{clock}</p>
          <p className="mt-[0.5vh] text-[clamp(13px,1.25vw,21px)] font-semibold uppercase tracking-[0.25em] text-navy-100">{dateLine}</p>
        </div>
      </header>

      {/* rotating view (key remount = the 400ms cut) */}
      <main className="min-h-0 flex-1 px-[3vw] pt-[1.6vh]">
        <div key={active} className="board-view-in h-full">
          {active === "tally" && <TallyView ctx={data.ctx} />}
          {active === "live" && <LiveView ctx={data.ctx} matches={data.live} featuredId={effFeatured} slide={slideIdx} slideCount={slideCount} />}
          {active === "upnext" && <UpNextView ctx={data.ctx} matches={data.upcoming} />}
          {active === "results" && <ResultsView ctx={data.ctx} matches={data.results} />}
        </div>
      </main>

      {/* manual controls — discreet bottom-right cluster, auto-hides after
          ~3s without mouse movement (move/tap brings it back). The view
          chips double as the rotation indicators; Live is disabled while
          nothing is live. Ticker + clock are outside this and never pause. */}
      <div className={`absolute bottom-[8.5vh] right-[2vw] z-20 flex flex-col items-end gap-2 transition-opacity duration-500 ${uiVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        {active === "live" && data.live.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {effFeatured ? (
              <>
                <span className="rounded-md bg-crimson-600 px-3 py-2 font-display tracking-tight text-sm font-bold uppercase text-white">
                  ★ Featured: {data.ctx.sportByDiv.get(data.live.find((m) => m.id === effFeatured)?.divisionId ?? "")} — {(() => { const f = data.live.find((m) => m.id === effFeatured); return f ? `${teamLine(f, 0)} vs ${teamLine(f, 1)}` : ""; })()}
                </span>
                <button type="button" onClick={resumeRotation}
                  className="min-h-[40px] rounded-md border border-navy-700 bg-navy-900/85 px-3 py-2 font-display tracking-tight text-sm font-bold uppercase text-navy-100 hover:bg-navy-800">
                  Release feature
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => stepSlide(-1)} disabled={slideCount <= 1}
                  className="min-h-[40px] rounded-md border border-navy-700 bg-navy-900/85 px-3 py-2 font-display tracking-tight text-sm font-bold uppercase text-navy-100 hover:bg-navy-800 disabled:opacity-40">‹ Prev game</button>
                {liveSlides(data.live).map((page, i) => (
                  <button key={page.map((m) => m.id).join("|")} type="button" onClick={() => { setLiveSlide(i); poke(); }} aria-pressed={i === slideIdx}
                    className={`min-h-[40px] rounded-md px-3 py-2 font-display tracking-tight text-sm font-bold uppercase ${i === slideIdx ? "bg-crimson-600 text-white" : "border border-navy-700 bg-navy-900/85 text-navy-100 hover:bg-navy-800"}`}>
                    {page.length === 1 ? `${data.ctx.sportByDiv.get(page[0].divisionId)} · ${page[0].label}` : `Games ${i * 4 + 1}–${Math.min(i * 4 + 4, data.live.length)}`}
                  </button>
                ))}
                <button type="button" onClick={() => stepSlide(1)} disabled={slideCount <= 1}
                  className="min-h-[40px] rounded-md border border-navy-700 bg-navy-900/85 px-3 py-2 font-display tracking-tight text-sm font-bold uppercase text-navy-100 hover:bg-navy-800 disabled:opacity-40">Next game ›</button>
                <select aria-label="Feature a live game" value="" onChange={(e) => { if (e.target.value) feature(e.target.value); }}
                  className="min-h-[40px] rounded-md border border-navy-700 bg-navy-900/85 px-2 py-2 font-display tracking-tight text-sm font-bold uppercase text-navy-100">
                  <option value="">★ Feature a game…</option>
                  {[...new Set(data.live.map((m) => data.ctx.sportByDiv.get(m.divisionId) ?? ""))].map((sportName) => (
                    <optgroup key={sportName} label={sportName}>
                      {data.live.filter((m) => (data.ctx.sportByDiv.get(m.divisionId) ?? "") === sportName).map((m) => (
                        <option key={m.id} value={m.id}>{teamLine(m, 0)} vs {teamLine(m, 1)} — {data.ctx.divById.get(m.divisionId)?.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
        <span className="mr-1 hidden text-[11px] font-semibold uppercase tracking-widest text-navy-100/70 lg:block">Space play/pause · ←/→ views or games</span>
        {ALL_VIEWS.map((v) => {
          const disabled = v === "live" && data.live.length === 0;
          const isActiveView = v === active;
          return (
            <button key={v} type="button" disabled={disabled} onClick={() => jump(v)} aria-pressed={isActiveView}
              className={`min-h-[40px] rounded-md px-3 py-2 font-display tracking-tight text-sm font-bold uppercase ${isActiveView ? "bg-crimson-600 text-white" : "border border-navy-700 bg-navy-900/85 text-navy-100 hover:bg-navy-800"} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}>
              {VIEW_LABELS[v]}
            </button>
          );
        })}
        <button type="button" onClick={togglePlay} aria-label={rotating ? "Pause rotation" : "Resume rotation"}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-navy-700 bg-navy-900/85 px-3 py-2 font-display tracking-tight text-sm font-bold uppercase text-navy-100 hover:bg-navy-800">
          {rotating ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="5" height="16" /><rect x="14" y="4" width="5" height="16" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
          )}
          <span>{rotating ? "Pause" : "Rotate"}</span>
        </button>
        </div>
      </div>

      <Ticker items={data.ticker} />
    </div>
  );
}

/** Static board shell shown while the live board streams in. */
function BoardLoading() {
  return (
    <div className="arena-bg fixed inset-0 flex flex-col items-center justify-center text-white">
      <p className="font-display tracking-tight text-[clamp(40px,5vw,84px)] font-bold uppercase">
        PGLU<span className="text-crimson-400">LYMPICS</span>
      </p>
      <p className="mt-2 text-[clamp(16px,1.6vw,26px)] uppercase tracking-[0.3em] text-navy-100">Loading the arena…</p>
    </div>
  );
}

export default function DisplayPage() {
  return (
    <Suspense fallback={<BoardLoading />}>
      <DisplayBoard />
    </Suspense>
  );
}
