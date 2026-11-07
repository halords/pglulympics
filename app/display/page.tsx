"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSnapshot } from "../../lib/data/context";
import { computeTally } from "../../lib/standings";
import { fmtDay, fmtTime, manilaDayKey } from "../../lib/format";
import { nextUpFixtures } from "../../lib/schedule";
import { matchScore } from "../../components/MatchCard";
import type { DivisionInfo, MatchInfo, Snapshot } from "../../lib/types";

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
}
const ctxOf = (snap: Snapshot): Ctx => ({
  snap,
  divById: new Map(snap.divisions.map((d) => [d.id, d])),
  sportByDiv: new Map(snap.divisions.map((d) => [d.id, snap.sports.find((s) => s.id === d.sportId)?.name ?? ""])),
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

function Scorebug({ ctx, match }: { ctx: Ctx; match: MatchInfo }) {
  const division = ctx.divById.get(match.divisionId);
  const score = matchScore(match, division);
  const label = [ctx.sportByDiv.get(match.divisionId), division?.name, match.label].filter(Boolean).join(" · ");
  if (division?.scoringKind === "placement_only") {
    const placed = (match.placements ?? []).filter((p) => p.place != null).sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
    const names = placed.length > 0
      ? placed.map((p) => `#${p.place} ${match.slots[p.slotNo - 1]?.teamName ?? "Entrant"}`)
      : match.slots.map((s) => s.teamName).filter((n): n is string => !!n);
    return (
      <div className="bg-navy-900 px-[2vw] py-[2vh]">
        <div className="flex items-center justify-between gap-4">
          <p className="font-display tracking-tight text-[clamp(16px,1.6vw,27px)] font-semibold uppercase text-navy-100">{label}</p>
          <LiveBug />
        </div>
        <p className="mt-[1vh] font-display tracking-tight text-[clamp(28px,3vw,52px)] font-bold uppercase leading-tight">{names.join("  ·  ") || "Event in progress"}</p>
      </div>
    );
  }
  const segStrip = match.segments.length > 0 && (
    <div className="mt-[1.4vh] flex flex-wrap justify-center gap-x-[2.2vw] gap-y-1 border-t-2 border-navy-800 pt-[1.2vh]">
      {match.segments.map((s) => (
        <span key={s.segmentNo} className="font-display tracking-tight text-[clamp(19px,1.9vw,33px)] font-semibold uppercase text-navy-100">
          {division?.scoringKind === "set_based" ? `Set ${s.segmentNo}` : `P${s.segmentNo}`}{" "}
          <span className="text-white tabular-nums">{s.points[0] ?? 0}–{s.points[1] ?? 0}</span>
          {s.status === "closed" ? "" : " ·"}
        </span>
      ))}
    </div>
  );
  return (
    <div className="bg-navy-900 px-[2vw] py-[2vh]">
      <div className="flex items-center justify-between gap-4">
        <p className="font-display tracking-tight text-[clamp(16px,1.6vw,27px)] font-semibold uppercase text-navy-100">{label}</p>
        <LiveBug />
      </div>
      <div className="mt-[0.6vh] grid grid-cols-[1fr_auto_1fr] items-center gap-[2vw]">
        <p className="text-right font-display tracking-tight text-[clamp(30px,3.6vw,64px)] font-bold uppercase leading-[0.95]">{teamLine(match, 0)}</p>
        <p className="font-display tracking-tight text-[clamp(64px,8.5vw,150px)] font-bold leading-none tabular-nums">
          {score ? <>{score.a}<span className="text-crimson-400 mx-[0.12em]">–</span>{score.b}</> : "VS"}
        </p>
        <p className="font-display tracking-tight text-[clamp(30px,3.6vw,64px)] font-bold uppercase leading-[0.95]">{teamLine(match, 1)}</p>
      </div>
      {segStrip}
      {match.venue && <p className="mt-[1vh] text-center text-[clamp(14px,1.3vw,22px)] uppercase tracking-widest text-navy-100">{match.venue}</p>}
    </div>
  );
}

function LiveView({ ctx, matches }: { ctx: Ctx; matches: MatchInfo[] }) {
  return (
    <div className="flex h-full flex-col">
      <BoardTitle title="Live Now" right={`${matches.length} match${matches.length === 1 ? "" : "es"} in play`} />
      <div className={`grid flex-1 content-center gap-[2vh] ${matches.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {matches.slice(0, 4).map((m) => <Scorebug key={m.id} ctx={ctx} match={m} />)}
      </div>
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
  const pinned: ViewKey | null = unpinned ? null : urlPin;

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
    setManualView(v);
    setPaused(false);
    poke();
  };
  const resumeRotation = () => {
    const idx = views.indexOf(active);
    if (idx >= 0) setCycleIdx(idx); // rotation continues from the shown view
    setManualView(null);
    setUnpinned(true);
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
  // Keyboard control for the laptop driving the TV (no dep array: handlers
  // are re-created every render, so re-subscribe to stay current).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
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
          {active === "live" && <LiveView ctx={data.ctx} matches={data.live} />}
          {active === "upnext" && <UpNextView ctx={data.ctx} matches={data.upcoming} />}
          {active === "results" && <ResultsView ctx={data.ctx} matches={data.results} />}
        </div>
      </main>

      {/* manual controls — discreet bottom-right cluster, auto-hides after
          ~3s without mouse movement (move/tap brings it back). The view
          chips double as the rotation indicators; Live is disabled while
          nothing is live. Ticker + clock are outside this and never pause. */}
      <div className={`absolute bottom-[8.5vh] right-[2vw] z-20 flex items-center gap-2 transition-opacity duration-500 ${uiVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <span className="mr-1 hidden text-[11px] font-semibold uppercase tracking-widest text-navy-100/70 lg:block">Space play/pause · ←/→ views</span>
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
