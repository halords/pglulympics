"use client";
import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useProvider, useSnapshot } from "../../../../../lib/data/context";
import { useSession } from "../../../../../lib/data/session";
import { computedWinner } from "../../../../../lib/standings";
import { fmtDayLong, fmtTime } from "../../../../../lib/format";
import type { MatchInfo, ScorePayload } from "../../../../../lib/types";
import { StatusPill } from "../../../../../components/MatchCard";

type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const btn = "h-12 w-12 shrink-0 rounded-xl bg-navy-800 text-white text-2xl font-bold flex items-center justify-center active:bg-navy-700 select-none";
  return (
    <div className="flex items-center gap-2" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Decrease ${label}`}>−</button>
      <input
        type="number" inputMode="numeric" min={0} value={value} aria-label={label}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="h-12 w-16 rounded-xl border-2 border-navy-100 text-center font-display tracking-tight text-2xl font-bold tabular-nums"
      />
      <button type="button" className={btn} onClick={() => onChange(value + 1)} aria-label={`Increase ${label}`}>+</button>
    </div>
  );
}

function ScoringPageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const matchId = decodeURIComponent(id);
  const snap = useSnapshot();
  const provider = useProvider();
  const session = useSession();

  const server = snap?.matches.find((m) => m.id === matchId) ?? null;
  const division = snap?.divisions.find((d) => d.id === server?.divisionId);

  const [draft, setDraft] = useState<MatchInfo | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forfeitWinner, setForfeitWinner] = useState<string>("");
  const serverRevRef = useRef<number>(-1);

  // adopt server copy when it changes and we are not mid-edit
  useEffect(() => {
    if (!server) return;
    if (serverRevRef.current === -1 || (saveState === "clean" || saveState === "saved")) {
      setDraft(structuredClone(server));
      serverRevRef.current = server.revision;
    }
  }, [server, saveState]);

  const dirty = useMemo(() => {
    if (!draft || !server) return false;
    return JSON.stringify([draft.segments, draft.totals, draft.placements]) !== JSON.stringify([server.segments, server.totals, server.placements]);
  }, [draft, server]);
  useEffect(() => { if (dirty && saveState === "clean") setSaveState("dirty"); }, [dirty, saveState]);

  if (!snap || !server || !draft || !division) return <p className="text-neutral-500 py-10 text-center">Loading match…</p>;
  const isAdmin = session.role === "admin";
  const editable = draft.status === "live" || draft.status === "scheduled";
  const preview = computedWinner(draft, division);
  const teamName = (slotNo: number) => draft.slots[slotNo - 1]?.teamName ?? draft.slots[slotNo - 1]?.placeholder ?? `Slot ${slotNo}`;

  const toPayload = (d: MatchInfo): ScorePayload => ({
    segments: d.segments.map((s) => ({
      segmentNo: s.segmentNo, kind: s.kind, status: s.status,
      scores: { 1: s.points[0] ?? 0, 2: s.points[1] ?? 0 },
    })),
    totals: d.totals ? { 1: d.totals[0] ?? 0, 2: d.totals[1] ?? 0 } : undefined,
    placements: d.placements?.map((p) => ({ slotNo: p.slotNo, place: p.place, finish: p.finish, note: p.note })),
  });

  const save = async (): Promise<boolean> => {
    setSaveState("saving"); setMessage(null);
    try {
      const res = await provider.saveScore(matchId, server.revision, toPayload(draft));
      serverRevRef.current = res.revision;
      setSaveState("saved");
      return true;
    } catch (e) {
      setSaveState("error");
      setMessage(e instanceof Error ? e.message : "Save failed");
      return false;
    }
  };

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true); setMessage(null);
    try { await fn(); setMessage(okMsg); } catch (e) { setMessage(e instanceof Error ? e.message : "Action failed"); }
    setBusy(false);
  };

  const finalize = async () => {
    if (dirty && !(await save())) return;
    if (preview.isDraw && !confirm("The scores are tied. Finalize as a DRAW? (Only allowed where the sport permits draws.)")) return;
    await act(async () => {
      await provider.setMatchStatus(matchId, "final", preview.isDraw ? { outcome: "draw" } : undefined);
    }, "Match finalized. Standings, advancement and medal drafts updated.");
  };

  const segLabel = division.scoringKind === "set_based" ? "Set" : "Period";
  const maxSegments = division.scoringKind === "set_based" ? Number(division.scoringConfig?.best_of ?? 5) : 8;

  return (
    <div className="space-y-5 pb-28 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <Link href="/console" className="text-sm font-semibold text-navy-800 underline">← Console</Link>
        <StatusPill status={server.status} needsReview={server.needsReview} />
      </div>
      <header>
        <h1 className="font-display tracking-tight text-3xl font-bold text-navy-950">{teamName(1)} <span className="text-crimson-800">vs</span> {teamName(2)}</h1>
        <p className="text-sm text-neutral-600">{division.name} · {draft.label} · {fmtDayLong(draft.startsAt)} · {fmtTime(draft.startsAt)} · {draft.venue ?? ""}</p>
        {draft.needsReview && <p className="mt-2 rounded-lg bg-crimson-100 border border-crimson-600 px-3 py-2 text-sm font-medium">This result is under review — it is excluded from standings and advancement until resolved{isAdmin ? ". Use Reset (clears the match and everything built on it) or Reopen to fix it." : " by an admin."}</p>}
      </header>

      {/* score entry */}
      <section className="rounded-2xl border border-navy-100 bg-white p-4 space-y-4">
        {division.scoringKind !== "placement_only" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-display tracking-tight text-xl font-bold">{division.scoringKind === "set_based" ? "SET SCORES" : "SCORES"}</h2>
              {editable && draft.segments.length < maxSegments && (
                <button
                  className="rounded-lg bg-navy-800 text-white px-3 py-2 text-sm font-semibold min-h-[44px]"
                  onClick={() => setDraft({ ...draft, segments: [...draft.segments, { segmentNo: draft.segments.length + 1, kind: division.scoringKind === "set_based" ? "set" : "period", status: "open", points: [0, 0] }] })}
                >+ Add {segLabel.toLowerCase()}</button>
              )}
            </div>
            {draft.segments.length === 0 && <p className="text-sm text-neutral-500">No {segLabel.toLowerCase()}s yet — add one to start scoring.</p>}
            {draft.segments.map((seg, si) => (
              <div key={seg.segmentNo} className="rounded-xl bg-navy-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-display tracking-tight text-lg font-bold">{segLabel} {seg.segmentNo}</span>
                  {editable && (
                    <button
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${seg.status === "closed" ? "bg-navy-950 text-white" : "bg-white border border-navy-800 text-navy-800"}`}
                      onClick={() => setDraft({ ...draft, segments: draft.segments.map((s, i) => i === si ? { ...s, status: s.status === "closed" ? "open" : "closed" } : s) })}
                    >{seg.status === "closed" ? "Closed ✓" : "Open — tap to close"}</button>
                  )}
                </div>
                {[0, 1].map((ti) => (
                  <div key={ti} className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{teamName(ti + 1)}</span>
                    <Stepper
                      label={`${teamName(ti + 1)} ${segLabel} ${seg.segmentNo}`}
                      value={seg.points[ti] ?? 0}
                      onChange={(v) => editable && setDraft({ ...draft, segments: draft.segments.map((s, i) => i === si ? { ...s, points: s.points.map((p, j) => j === ti ? v : p) } : s) })}
                    />
                  </div>
                ))}
              </div>
            ))}
            {division.scoringKind === "simple" && (
              <div className="rounded-xl bg-navy-50 p-3">
                <span className="font-display tracking-tight text-lg font-bold">Match total (if scored as one number)</span>
                {[0, 1].map((ti) => (
                  <div key={ti} className="flex items-center justify-between gap-2 mt-2">
                    <span className="font-medium truncate">{teamName(ti + 1)}</span>
                    <Stepper label={`${teamName(ti + 1)} total`} value={draft.totals?.[ti] ?? 0}
                      onChange={(v) => editable && setDraft({ ...draft, totals: [draft.totals?.[0] ?? 0, draft.totals?.[1] ?? 0].map((p, j) => j === ti ? v : p) })} />
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-neutral-600">
              {preview.winnerEntryId ? <>Winner by current scores: <strong>{teamName(draft.slots.findIndex((s) => s.entryId === preview.winnerEntryId) + 1)}</strong></>
                : preview.isDraw ? <>Currently <strong>tied</strong>.</> : "No winner yet by the current scores."}
            </p>
          </>
        )}

        {division.scoringKind === "placement_only" && (
          <>
            <h2 className="font-display tracking-tight text-xl font-bold">PLACEMENTS</h2>
            {draft.slots.filter((s) => s.entryId).map((slot) => {
              const pl = draft.placements?.find((p) => p.slotNo === slot.slotNo);
              return (
                <div key={slot.slotNo} className="flex items-center justify-between gap-2 rounded-xl bg-navy-50 p-3">
                  <span className="font-medium">{slot.teamName}</span>
                  <span className="flex items-center gap-2">
                    <label className="text-xs font-semibold">Place</label>
                    <input type="number" min={1} value={pl?.place ?? ""} disabled={!editable}
                      onChange={(e) => {
                        const place = e.target.value ? Number(e.target.value) : null;
                        const others = (draft.placements ?? []).filter((p) => p.slotNo !== slot.slotNo);
                        setDraft({ ...draft, placements: [...others, { slotNo: slot.slotNo, place, finish: "finished", note: pl?.note ?? null }] });
                      }}
                      className="h-11 w-16 rounded-lg border-2 border-navy-100 text-center font-display tracking-tight text-xl font-bold tabular-nums" />
                  </span>
                </div>
              );
            })}
          </>
        )}
      </section>

      {/* status actions */}
      <section className="rounded-2xl border border-navy-100 bg-white p-4 space-y-3">
        <h2 className="font-display tracking-tight text-xl font-bold">MATCH CONTROL</h2>
        <div className="flex flex-wrap gap-2">
          {draft.status === "scheduled" && (
            <button disabled={busy} className="rounded-xl bg-crimson-600 text-white px-5 py-3 font-bold min-h-[52px] disabled:opacity-60"
              onClick={() => act(async () => { if (dirty) await save(); await provider.setMatchStatus(matchId, "live"); }, "Match is LIVE — contestants are now frozen.")}>
              ▶ Start match (go live)
            </button>
          )}
          {draft.status === "live" && (
            <button disabled={busy} className="rounded-xl bg-crimson-800 text-white px-5 py-3 font-bold min-h-[52px] disabled:opacity-60" onClick={() => void finalize()}>
              ✓ Finalize result
            </button>
          )}
          {draft.status === "final" && !draft.needsReview && (
            <button disabled={busy} className="rounded-xl bg-white border-2 border-crimson-600 text-navy-950 px-5 py-3 font-bold min-h-[52px] disabled:opacity-60"
              onClick={() => { const reason = prompt("Why does this result need correction?"); if (reason) void act(() => provider.requestCorrection(matchId, reason), "Flagged for correction — held out of standings pending admin resolution."); }}>
              ⚑ Request correction
            </button>
          )}
          {draft.status === "final" && isAdmin && (
            <button disabled={busy} className="rounded-xl bg-white border-2 border-navy-800 text-navy-950 px-5 py-3 font-bold min-h-[52px] disabled:opacity-60"
              onClick={() => { if (confirm("Reopen this match for editing? Medal drafts from it are voided and dependents are re-checked.")) void act(() => provider.setMatchStatus(matchId, "scheduled"), "Match reopened."); }}>
              Reopen (admin)
            </button>
          )}
          {isAdmin && draft.status !== "cancelled" && (
            <button disabled={busy} className="rounded-xl bg-white border-2 border-crimson-800 text-crimson-800 px-5 py-3 font-bold min-h-[52px] disabled:opacity-60"
              onClick={() => { if (confirm("RESET this match? Scores are cleared and every match built on its result is reset too. This cannot be undone.")) void act(() => provider.resetMatch(matchId, "admin reset from scoring screen"), "Match and its dependents were reset."); }}>
              Reset match (admin)
            </button>
          )}
          {(draft.status === "scheduled" || draft.status === "live") && (
            <button disabled={busy} className="rounded-xl bg-white border border-neutral-300 text-neutral-600 px-5 py-3 font-semibold min-h-[52px] disabled:opacity-60"
              onClick={() => { if (confirm("Cancel this match?")) void act(() => provider.setMatchStatus(matchId, "cancelled"), "Match cancelled."); }}>
              Cancel match
            </button>
          )}
        </div>
        {draft.status === "live" && division.scoringKind !== "placement_only" && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-sm font-semibold">Forfeit:</span>
            <select value={forfeitWinner} onChange={(e) => setForfeitWinner(e.target.value)} className="rounded-lg border border-navy-100 px-2 py-2 min-h-[44px] text-sm">
              <option value="">Winner by forfeit…</option>
              {draft.slots.filter((s) => s.entryId).map((s) => <option key={s.slotNo} value={s.entryId!}>{s.teamName}</option>)}
            </select>
            <button disabled={busy || !forfeitWinner} className="rounded-lg bg-crimson-800 text-white px-4 py-2 font-semibold text-sm min-h-[44px] disabled:opacity-50"
              onClick={() => { if (confirm("Finalize as a forfeit win?")) void act(() => provider.setMatchStatus(matchId, "final", { outcome: "forfeit", winnerEntryId: forfeitWinner }), "Recorded as a forfeit win."); }}>
              Finalize forfeit
            </button>
          </div>
        )}
        {message && <p className="rounded-lg bg-navy-50 border border-navy-100 px-3 py-2 text-sm">{message}</p>}
      </section>

      {/* sticky save bar */}
      {editable && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-navy-100">
          <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm font-medium">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Server-confirmed" : saveState === "error" ? "⚠ Save failed — retry" : dirty ? "● Unsaved changes" : "All changes saved"}
            </span>
            <button disabled={!dirty || saveState === "saving"} onClick={() => void save()}
              className="rounded-xl bg-crimson-800 text-white px-6 py-3 font-bold min-h-[52px] disabled:opacity-40">
              Save scores
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScoringPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-neutral-500 py-10 text-center">Loading…</p>}>
      <ScoringPageInner {...props} />
    </Suspense>
  );
}
