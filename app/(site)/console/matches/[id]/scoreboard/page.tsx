"use client";
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useProvider, useSnapshot } from "../../../../../../lib/data/context";
import { useSession } from "../../../../../../lib/data/session";
import { computedWinner, setsWon } from "../../../../../../lib/standings";
import {
  advancePeriod, applyPeriodPoints, applyRallyPoint, rallyConfig, rallyMatchWinner,
  scorerMode, segmentTotals, setTargetFor,
} from "../../../../../../lib/scoring";
import { sportIdentity, SportIcon } from "../../../../../../lib/sport-identity";
import { fmtDay, fmtTime } from "../../../../../../lib/format";
import type { MatchInfo, ScorePayload, SegmentInfo } from "../../../../../../lib/types";
import { StatusPill } from "../../../../../../components/MatchCard";

// Courtside scoreboard: one match, in the scorer's hand. Sport identity on
// top, division/category under it, then giant tap-to-score controls tailored
// to the sport's scoring profile. Every tap is applied optimistically AND
// persisted through provider.saveScore (serialized; the server revision is
// authoritative), so the public site and the TV board update via realtime.
interface BoardState { segments: SegmentInfo[]; totals: [number, number] | null }

const cloneState = (s: BoardState): BoardState => ({
  segments: s.segments.map((x) => ({ ...x, points: [...x.points] })),
  totals: s.totals ? [s.totals[0], s.totals[1]] : null,
});
const stateOf = (m: MatchInfo): BoardState => ({
  segments: m.segments.map((x) => ({ ...x, points: [...x.points] })),
  totals: m.totals ? [m.totals[0] ?? 0, m.totals[1] ?? 0] : null,
});
const sameState = (a: BoardState, b: BoardState) => JSON.stringify(a) === JSON.stringify(b);

function ScoreboardInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const matchId = decodeURIComponent(id);
  const snap = useSnapshot();
  const provider = useProvider();
  const session = useSession();

  const server = snap?.matches.find((m) => m.id === matchId) ?? null;
  const division = snap?.divisions.find((d) => d.id === server?.divisionId);
  const sport = snap?.sports.find((s) => s.id === division?.sportId);
  const mode = division ? scorerMode(division, sport?.slug ?? "") : "totals";
  const identity = sportIdentity(sport);
  const cfg = useMemo(() => (division ? rallyConfig(division) : null), [division]);

  const [local, setLocal] = useState<BoardState | null>(null);
  const [sync, setSync] = useState<"synced" | "saving" | "error">("synced");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const baseRef = useRef<{ state: BoardState; revision: number } | null>(null);
  const localRef = useRef<BoardState | null>(null);
  const savingRef = useRef(false);
  const historyRef = useRef<BoardState[]>([]);

  // Adopt the server copy at first sight, and again whenever it moves and we
  // hold no unsaved local taps (e.g. another scorer's device updated it).
  useEffect(() => {
    if (!server) return;
    const incoming = stateOf(server);
    if (!baseRef.current) {
      baseRef.current = { state: incoming, revision: server.revision };
      localRef.current = incoming;
      setLocal(incoming);
      return;
    }
    if (server.revision !== baseRef.current.revision && localRef.current && sameState(localRef.current, baseRef.current.state)) {
      baseRef.current = { state: incoming, revision: server.revision };
      localRef.current = incoming;
      setLocal(incoming);
    }
  }, [server]);

  const toPayload = useCallback((st: BoardState): ScorePayload => {
    if (mode === "rally") {
      return { segments: st.segments.map((s) => ({ segmentNo: s.segmentNo, kind: s.kind, status: s.status, scores: { 1: s.points[0] ?? 0, 2: s.points[1] ?? 0 } })) };
    }
    if (mode === "periods") {
      const t = segmentTotals(st.segments);
      return {
        segments: st.segments.map((s) => ({ segmentNo: s.segmentNo, kind: s.kind, status: s.status, scores: { 1: s.points[0] ?? 0, 2: s.points[1] ?? 0 } })),
        totals: { 1: t[0], 2: t[1] },
      };
    }
    return { segments: [], totals: { 1: st.totals?.[0] ?? 0, 2: st.totals?.[1] ?? 0 } };
  }, [mode]);

  const flush = useCallback(async () => {
    if (savingRef.current || !baseRef.current || !localRef.current) return;
    if (sameState(localRef.current, baseRef.current.state)) { setSync("synced"); return; }
    savingRef.current = true;
    setSync("saving");
    try {
      while (baseRef.current && localRef.current && !sameState(localRef.current, baseRef.current.state)) {
        const sending = cloneState(localRef.current);
        const res = await provider.saveScore(matchId, baseRef.current.revision, toPayload(sending));
        baseRef.current = { state: sending, revision: res.revision };
      }
      setSync("synced");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      if (/stale revision/i.test(msg)) {
        // Another device saved first — drop our queue and adopt the server.
        baseRef.current = null;
        setNotice("The score was updated on another device — reloaded the latest.");
      } else {
        setNotice(msg);
      }
      setSync("error");
    } finally {
      savingRef.current = false;
    }
  }, [matchId, provider, toPayload]);

  const apply = useCallback((next: BoardState) => {
    if (!localRef.current) return;
    historyRef.current = [...historyRef.current.slice(-59), cloneState(localRef.current)];
    localRef.current = next;
    setLocal(next);
    void flush();
  }, [flush]);

  const undo = useCallback(() => {
    const prev = historyRef.current[historyRef.current.length - 1];
    if (!prev) return;
    historyRef.current = historyRef.current.slice(0, -1);
    localRef.current = prev;
    setLocal(prev);
    void flush();
  }, [flush]);

  if (!session.ready || !snap) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;
  if (!session.role) {
    return (
      <div className="max-w-md mx-auto text-center space-y-3 py-8">
        <h1 className="font-display tracking-tight text-3xl font-bold text-navy-950">SCOREBOARD</h1>
        <p className="text-neutral-600">You need a staff account to run the scoreboard.</p>
        <Link href="/login" className="inline-block rounded-xl bg-crimson-800 text-white px-6 py-3 font-semibold">Go to sign-in</Link>
      </div>
    );
  }
  if (!server || !division || !sport || !local) return <p className="text-neutral-500 py-10 text-center">Loading match…</p>;

  const teamName = (slotNo: number) => server.slots[slotNo - 1]?.teamName ?? server.slots[slotNo - 1]?.placeholder ?? `Slot ${slotNo}`;
  const canScore = server.status === "live";
  const previewMatch: MatchInfo = { ...server, segments: local.segments, totals: mode === "periods" ? segmentTotals(local.segments) : local.totals };
  const preview = computedWinner(previewMatch, division);
  const winnerName = preview.winnerEntryId
    ? teamName(server.slots.findIndex((s) => s.entryId === preview.winnerEntryId) + 1)
    : null;

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true); setNotice(null);
    try { await fn(); setNotice(okMsg); } catch (e) { setNotice(e instanceof Error ? e.message : "Action failed"); }
    setBusy(false);
  };

  const finalize = async () => {
    if (!winnerName && !preview.isDraw) return;
    const label = preview.isDraw ? "Finalize as a DRAW?" : `Finalize and tag ${winnerName} as the winner?`;
    if (!confirm(label)) return;
    await act(async () => {
      await flush();
      if (baseRef.current && localRef.current && !sameState(localRef.current, baseRef.current.state)) {
        throw new Error("Scores are still saving — wait a moment and finalize again.");
      }
      await provider.setMatchStatus(matchId, "final", preview.isDraw ? { outcome: "draw" } : undefined);
    }, "Result finalized — standings and the TV board are updated.");
  };

  /* ---------- sport-tailored tap handlers ---------- */
  const rallyTap = (side: 0 | 1, delta: 1 | -1) => {
    if (!cfg || !canScore) return;
    apply({ segments: applyRallyPoint(local.segments, side, delta, cfg), totals: null });
  };
  const periodTap = (side: 0 | 1, delta: number) => {
    if (!canScore) return;
    apply({ segments: applyPeriodPoints(local.segments, side, delta), totals: null });
  };
  const totalsTap = (side: 0 | 1, delta: number) => {
    if (!canScore) return;
    const t: [number, number] = [local.totals?.[0] ?? 0, local.totals?.[1] ?? 0];
    t[side] = Math.max(0, t[side] + delta);
    apply({ segments: [], totals: t });
  };

  /* ---------- derived display values ---------- */
  const currentSeg = local.segments[local.segments.length - 1];
  const currentSegNo = mode === "rally"
    ? (currentSeg && currentSeg.status === "open" ? currentSeg.segmentNo : Math.min(local.segments.length + 1, cfg?.bestOf ?? 1))
    : (currentSeg?.segmentNo ?? 1);
  const rallyTarget = cfg ? setTargetFor(cfg, currentSegNo - 1) : 0;
  const bigScore = (side: 0 | 1): number => {
    if (mode === "rally") {
      const open = [...local.segments].reverse().find((s) => s.status === "open") ?? local.segments[local.segments.length - 1];
      return open?.points[side] ?? 0;
    }
    if (mode === "periods") return segmentTotals(local.segments)[side];
    return local.totals?.[side] ?? 0;
  };
  const setsLine = (side: 0 | 1) => setsWon({ segments: local.segments } as MatchInfo, side);
  const decided = cfg ? rallyMatchWinner(local.segments, cfg) : null;

  const tapBtn = "rounded-2xl font-display tracking-tight font-bold select-none transition active:scale-[0.97] disabled:opacity-40";

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-32">
      <div className="flex items-center justify-between gap-2">
        <Link href="/console" className="text-sm font-semibold text-navy-800 underline">← Console</Link>
        <span className="flex items-center gap-2">
          <Link href={`/console/matches/${matchId}`} className="text-sm font-semibold text-navy-800 underline">Scoring details</Link>
          <StatusPill status={server.status} needsReview={server.needsReview} />
        </span>
      </div>

      {/* sport identity header — the sport leads, category under it */}
      <header className="overflow-hidden rounded-2xl bg-navy-950 text-white">
        <div className="h-1.5" style={{ backgroundColor: identity.tint }} />
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${identity.tint}33`, color: identity.tint }}>
              <SportIcon sport={sport} className="h-9 w-9" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display tracking-tight text-4xl font-bold uppercase leading-none sm:text-5xl">{sport.name}</h1>
              <p className="mt-1 truncate text-sm font-semibold uppercase tracking-widest text-navy-100">
                {division.name} · {server.label}
              </p>
            </div>
            {server.status === "live" && (
              <span className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full bg-crimson-600 px-3 py-1.5 font-display tracking-tight text-sm font-bold uppercase">
                <span className="live-dot block h-2 w-2 rounded-full bg-white" />Live
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-navy-100">
            {fmtDay(server.startsAt)} · {fmtTime(server.startsAt)}{server.venue ? <> · {server.venue}</> : null}
            {mode === "rally" && cfg ? <> · Best of {cfg.bestOf} · first to {cfg.setTarget}{cfg.decidingTarget !== cfg.setTarget ? ` (decider ${cfg.decidingTarget})` : ""} · win by {cfg.winBy}{cfg.cap ? ` · cap ${cfg.cap}` : ""}</> : null}
            {mode === "periods" ? <> · Tap +1 / +2 / +3 per basket</> : null}
          </p>
        </div>
      </header>

      {notice && <p className="rounded-lg bg-navy-50 border border-navy-100 px-3 py-2 text-sm">{notice}</p>}

      {mode === "placement" ? (
        <section className="rounded-2xl border border-navy-100 bg-white p-5 text-center space-y-3">
          <p className="font-display tracking-tight text-2xl font-bold text-navy-950">PLACEMENT EVENT — NO RALLY SCOREBOARD</p>
          <p className="text-sm text-neutral-600">{sport.name} · {division.name} is decided by finishing places, not points. Enter the places on the scoring screen — they publish to the board as they are saved.</p>
          <Link href={`/console/matches/${matchId}`} className="inline-block rounded-xl bg-crimson-800 text-white px-6 py-3 font-bold min-h-[52px]">Enter placements</Link>
        </section>
      ) : server.status === "final" ? (
        <section className="rounded-2xl border border-navy-100 bg-white p-5 text-center space-y-2">
          <p className="font-display tracking-tight text-2xl font-bold text-navy-950">FINAL</p>
          <p className="text-lg">{teamName(1)} <strong className="tabular-nums">{bigScore(0)} – {bigScore(1)}</strong> {teamName(2)}</p>
          {server.winnerEntryId && <p className="text-sm">Winner: <strong>{teamName(server.slots.findIndex((s) => s.entryId === server.winnerEntryId) + 1)}</strong></p>}
          <p className="text-sm text-neutral-600">Corrections and reopens live on the scoring details screen.</p>
          <Link href={`/console/matches/${matchId}`} className="inline-block rounded-xl bg-navy-950 text-white px-6 py-3 font-bold min-h-[52px]">Open scoring details</Link>
        </section>
      ) : (
        <>
          {/* segment strip */}
          <div className="flex flex-wrap items-center gap-1.5">
            {local.segments.map((s) => (
              <span key={s.segmentNo}
                className={`rounded-full px-3 py-1.5 text-sm font-bold tabular-nums ${s.status === "open" ? "text-white" : "bg-navy-50 border border-navy-100 text-navy-900"}`}
                style={s.status === "open" ? { backgroundColor: identity.tint } : undefined}>
                {mode === "rally" ? `Set ${s.segmentNo}` : `Q${s.segmentNo}`} · {s.points[0] ?? 0}–{s.points[1] ?? 0}{s.status === "open" ? " ·" : ""}
              </span>
            ))}
            {local.segments.length === 0 && (
              <span className="text-sm text-neutral-500">{mode === "rally" ? "Set 1" : mode === "periods" ? "Q1" : "No score yet"} — tap a team&apos;s score to start.</span>
            )}
            <span className="ml-auto text-sm font-semibold text-navy-900">
              {mode === "rally" && cfg ? <>SET {currentSegNo} · first to {rallyTarget}</> : mode === "periods" ? <>PERIOD {currentSeg?.segmentNo ?? 1}</> : <>TOTAL</>}
            </span>
          </div>

          {/* team panels */}
          <div className="grid grid-cols-2 gap-3">
            {([0, 1] as const).map((side) => (
              <section key={side} className="rounded-2xl border border-navy-100 bg-white p-3.5 space-y-3">
                <div>
                  <p className="font-display tracking-tight text-xl font-bold uppercase leading-tight text-navy-950 break-words">{teamName(side + 1)}</p>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    {mode === "rally" ? <>Sets won: <strong className="text-navy-950">{setsLine(side)}</strong>{decided === side ? " · match won" : ""}</>
                      : mode === "periods" ? <>Total points</> : <>Score</>}
                  </p>
                </div>
                {mode === "rally" ? (
                  <>
                    <button type="button" disabled={!canScore} onClick={() => rallyTap(side, 1)}
                      className={`${tapBtn} block w-full bg-navy-950 py-4 text-white text-7xl leading-none tabular-nums sm:text-8xl`}
                      aria-label={`Add a point to ${teamName(side + 1)}`}>
                      {bigScore(side)}
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={!canScore} onClick={() => rallyTap(side, 1)} className={`${tapBtn} bg-crimson-800 py-3 text-lg text-white min-h-[56px]`}>+1 point</button>
                      <button type="button" disabled={!canScore} onClick={() => rallyTap(side, -1)} className={`${tapBtn} border-2 border-navy-100 bg-white py-3 text-lg text-navy-900 min-h-[56px]`}>−1</button>
                    </div>
                  </>
                ) : mode === "periods" ? (
                  <>
                    <p className="py-1 text-center font-display tracking-tight text-7xl font-bold leading-none tabular-nums text-navy-950 sm:text-8xl">{bigScore(side)}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3].map((n) => (
                        <button key={n} type="button" disabled={!canScore} onClick={() => periodTap(side, n)} className={`${tapBtn} bg-crimson-800 py-3 text-2xl text-white min-h-[60px]`}>+{n}</button>
                      ))}
                    </div>
                    <button type="button" disabled={!canScore} onClick={() => periodTap(side, -1)} className={`${tapBtn} w-full border-2 border-navy-100 bg-white py-2.5 text-base text-navy-900 min-h-[48px]`}>−1 correction</button>
                  </>
                ) : (
                  <>
                    <p className="py-1 text-center font-display tracking-tight text-7xl font-bold leading-none tabular-nums text-navy-950 sm:text-8xl">{bigScore(side)}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={!canScore} onClick={() => totalsTap(side, 1)} className={`${tapBtn} bg-crimson-800 py-3 text-lg text-white min-h-[56px]`}>+1</button>
                      <button type="button" disabled={!canScore} onClick={() => totalsTap(side, -1)} className={`${tapBtn} border-2 border-navy-100 bg-white py-3 text-lg text-navy-900 min-h-[56px]`}>−1</button>
                    </div>
                  </>
                )}
              </section>
            ))}
          </div>

          {/* mid controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={undo} disabled={historyRef.current.length === 0}
              className="rounded-xl bg-white border-2 border-navy-800 px-4 py-2.5 font-bold text-sm min-h-[48px] disabled:opacity-40">
              ↩ Undo last tap
            </button>
            {mode === "periods" && canScore && (
              <button type="button" onClick={() => apply({ segments: advancePeriod(local.segments), totals: null })}
                className="rounded-xl bg-navy-950 text-white px-4 py-2.5 font-bold text-sm min-h-[48px]">
                End period → Q{(currentSeg?.segmentNo ?? 1) + 1}
              </button>
            )}
            <span className="text-sm text-neutral-600">
              {sync === "saving" ? "Saving…" : sync === "error"
                ? <button type="button" className="font-bold text-crimson-800 underline" onClick={() => void flush()}>⚠ Save failed — tap to retry</button>
                : "✓ Synced — live on the public board"}
            </span>
          </div>

          {server.status === "scheduled" && (
            <section className="rounded-2xl border border-navy-100 bg-white p-4 text-center space-y-2">
              <p className="text-sm text-neutral-600">The match has not started. Starting freezes the contestants and opens scoring.</p>
              <button disabled={busy} onClick={() => void act(() => provider.setMatchStatus(matchId, "live"), "Match is LIVE — scoring is open.")}
                className="rounded-xl bg-crimson-600 text-white px-6 py-3.5 font-bold min-h-[56px] disabled:opacity-60">
                ▶ Start match (go live)
              </button>
            </section>
          )}
        </>
      )}

      {/* sticky action bar: finalize + winner tag */}
      {mode !== "placement" && server.status === "live" && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-navy-100">
          <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium">
              {preview.isDraw ? <>Scores are <strong>tied</strong>.</>
                : winnerName ? <>Winner by score: <strong>{winnerName}</strong></>
                : "No winner yet by the current scores."}
            </span>
            <button disabled={busy || (!winnerName && !preview.isDraw)} onClick={() => void finalize()}
              className="shrink-0 rounded-xl bg-crimson-800 text-white px-5 py-3 font-bold min-h-[52px] disabled:opacity-40">
              {preview.isDraw ? "Finalize as draw" : "✓ Finalize + tag winner"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScoreboardPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-neutral-500 py-10 text-center">Loading…</p>}>
      <ScoreboardInner {...props} />
    </Suspense>
  );
}
