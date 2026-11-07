"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useProvider, useSnapshot } from "../../../../lib/data/context";
import { useSession } from "../../../../lib/data/session";
import { consoleScopeSportIds } from "../../../../lib/scope";
import { fmtDay, fmtTime } from "../../../../lib/format";
import type { ConflictReport, FixtureEditInput, FixtureInput, MatchInfo, MatchStage } from "../../../../lib/types";
import { StatusPill } from "../../../../components/MatchCard";
import SportSwitcher from "../../../../components/SportSwitcher";

/** Manila wall-clock input value -> ISO instant. */
function manilaToISO(local: string): string {
  return new Date(`${local}:00+08:00`).toISOString();
}
function isoToManilaLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

type WarningAction = "create" | "edit" | "teams";

export default function FixturesPage() {
  const snap = useSnapshot();
  const provider = useProvider();
  const session = useSession();

  const [sportFilter, setSportFilter] = useState<string>("all");
  const [divisionId, setDivisionId] = useState("");
  const [label, setLabel] = useState("");
  const [stage, setStage] = useState<MatchStage>("round_robin");
  const [groupId, setGroupId] = useState("");
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState("");
  const [venueId, setVenueId] = useState("");
  const [venueText, setVenueText] = useState("");
  const [entryA, setEntryA] = useState("");
  const [entryB, setEntryB] = useState("");
  const [placementEntries, setPlacementEntries] = useState<string[]>([]);
  const [warning, setWarning] = useState<{ hash: string; report: ConflictReport } | null>(null);
  const [warningAction, setWarningAction] = useState<WarningAction>("create");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MatchInfo | null>(null);
  const [editWhen, setEditWhen] = useState("");
  const [editVenueId, setEditVenueId] = useState("");
  const [editVenueText, setEditVenueText] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editEntries, setEditEntries] = useState<string[]>([]);

  // Scope: every sport assigned to this coordinator (admin: all sports).
  const scopeIds = useMemo(
    () => (snap ? consoleScopeSportIds(session, snap.sports.map((s) => s.id)) : []),
    [snap, session],
  );
  const scopeSports = useMemo(
    () => (snap ? snap.sports.filter((s) => scopeIds.includes(s.id)) : []),
    [snap, scopeIds],
  );
  const myDivisions = useMemo(() => {
    if (!snap) return [];
    const scope = new Set(scopeIds);
    return snap.divisions.filter((d) => scope.has(d.sportId) && (sportFilter === "all" || d.sportId === sportFilter));
  }, [snap, scopeIds, sportFilter]);

  if (!session.ready || !snap) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;
  if (!session.role) return <p className="py-10 text-center">Sign in first — <Link href="/login" className="underline font-semibold">go to sign-in</Link>.</p>;

  const div = snap.divisions.find((d) => d.id === (divisionId || myDivisions[0]?.id));
  const isPlacement = div?.scoringKind === "placement_only";
  const divEntries = div ? snap.entries.filter((e) => e.divisionId === div.id) : [];
  const teamName = (entryId: string) => {
    const e = snap.entries.find((x) => x.id === entryId);
    return e ? snap.teams.find((t) => t.id === e.teamId)?.name ?? "" : "";
  };
  const myMatches = snap.matches.filter((m) => myDivisions.some((d) => d.id === m.divisionId))
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));

  const teamsEditable = !!editing && editing.status === "scheduled"
    && editing.slots.every((s) => !s.source || s.source.kind === "entry");
  const teamsChanged = teamsEditable && editEntries.some((e, i) => e !== (editing!.slots[i].entryId ?? ""));

  const submitCreate = async (ackHash?: string) => {
    if (!div || !when) { setNotice("Pick a division and a date/time."); return; }
    let entryIds: string[];
    if (isPlacement) {
      if (placementEntries.length < 2) { setNotice("Pick at least two entrants for the placement event."); return; }
      entryIds = placementEntries;
    } else {
      if (!entryA || !entryB || entryA === entryB) { setNotice("Pick two different teams."); return; }
      entryIds = [entryA, entryB];
    }
    const input: FixtureInput = {
      divisionId: div.id, label: label || "Custom match", stage, groupId: groupId || null,
      startsAt: manilaToISO(when), durationMinutes: duration ? Number(duration) : null,
      venueId: venueId || null, venueText: venueText || null, entryIds,
    };
    setBusy(true); setNotice(null);
    try {
      const res = await provider.createFixture(input, ackHash);
      if (res.status === "warning") { setWarning({ hash: res.ackHash, report: res.conflicts }); setWarningAction("create"); }
      else { setWarning(null); setNotice("Fixture created."); setLabel(""); }
    } catch (e) { setNotice(e instanceof Error ? e.message : "Create failed"); }
    setBusy(false);
  };

  const submitEdit = async (ackHash?: string, step: "edit" | "teams" = "edit") => {
    if (!editing) return;
    setBusy(true); setNotice(null);
    try {
      if (step === "edit") {
        if (!editWhen) { setNotice("Pick a date/time."); setBusy(false); return; }
        const input: FixtureEditInput = {
          startsAt: manilaToISO(editWhen), venueId: editVenueId || null,
          venueText: editVenueId ? null : (editVenueText || null),
          label: editLabel || undefined, durationMinutes: editing.durationMinutes,
        };
        const res = await provider.updateFixture(editing.id, input, ackHash);
        if (res.status === "warning") { setWarning({ hash: res.ackHash, report: res.conflicts }); setWarningAction("edit"); setBusy(false); return; }
        if (!teamsChanged) { setWarning(null); setEditing(null); setNotice("Fixture updated."); setBusy(false); return; }
        // fall through: teams changed too — save them in the same click
      }
      if (editEntries.some((e) => !e)) { setNotice("Pick a team for every slot."); setBusy(false); return; }
      if (new Set(editEntries).size !== editEntries.length) { setNotice("Each slot needs a different team."); setBusy(false); return; }
      const res = await provider.setFixtureTeams(editing.id, editEntries, step === "teams" ? ackHash : undefined);
      if (res.status === "warning") { setWarning({ hash: res.ackHash, report: res.conflicts }); setWarningAction("teams"); setBusy(false); return; }
      setWarning(null); setEditing(null); setNotice("Fixture updated.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Update failed"); }
    setBusy(false);
  };

  const startEdit = (m: MatchInfo) => {
    setEditing(m);
    setEditWhen(isoToManilaLocal(m.startsAt));
    setEditVenueId(m.venueId ?? "");
    setEditVenueText(m.venueId ? "" : (m.venue ?? ""));
    setEditLabel(m.label);
    setEditEntries(m.slots.map((s) => s.entryId ?? ""));
    setWarning(null);
  };

  const inputCls = "w-full rounded-lg border border-navy-100 px-3 py-2.5 min-h-[48px] text-sm bg-white";
  const lbl = "block text-sm font-semibold mb-1";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="font-display tracking-tight text-4xl font-bold text-navy-950">FIXTURES</h1>
        <Link href="/console" className="text-sm font-semibold text-navy-800 underline">← Console</Link>
      </header>
      <SportSwitcher sports={scopeSports} value={sportFilter} onChange={setSportFilter} />
      {notice && <p className="rounded-lg bg-navy-50 border border-navy-100 px-3 py-2 text-sm">{notice}</p>}

      {warning && (
        <section className="rounded-xl border-2 border-crimson-800 bg-white p-4 space-y-2">
          <h2 className="font-display tracking-tight text-xl font-bold text-crimson-800">⚠ SCHEDULING CONFLICTS — NOT SAVED YET</h2>
          {warning.report.playerClashes.map((c, i) => (
            <p key={`p${i}`} className="text-sm"><strong>{c.player_name}</strong> is also playing <strong>{c.other_label}</strong> ({c.other_sport}) {fmtDay(c.other_starts_at)} {fmtTime(c.other_starts_at)}–{fmtTime(c.other_ends_at)}.</p>
          ))}
          {warning.report.venueClashes.map((c, i) => (
            <p key={`v${i}`} className="text-sm"><strong>Venue clash:</strong> {c.venue_name} is booked by <strong>{c.other_label}</strong> ({c.other_sport}) {fmtDay(c.other_starts_at)} {fmtTime(c.other_starts_at)}–{fmtTime(c.other_ends_at)}.</p>
          ))}
          {warning.report.incomplete.map((code, i) => (
            <p key={`i${i}`} className="text-sm text-neutral-600">{
              code === "roster_unverified" ? "Coverage note: at least one involved roster is not verified, so its players could not be checked."
              : code === "venue_unmapped" ? "Coverage note: no venue selected, so venue double-booking could not be checked."
              : code === "participants_unresolved_elsewhere" ? "Coverage note: another overlapping fixture has unresolved participants (e.g. a playoff slot), so its players could not be checked."
              : code === "uncheckable_no_time" ? "Coverage note: this fixture has no date/time yet, so nothing could be checked."
              : `Coverage note: ${code}`
            }</p>
          ))}
          <div className="flex gap-2 pt-1">
            <button disabled={busy} className="rounded-xl bg-crimson-800 text-white px-5 py-3 font-bold min-h-[48px] disabled:opacity-60"
              onClick={() => void (warningAction === "create" ? submitCreate(warning.hash) : submitEdit(warning.hash, warningAction))}>
              Save anyway (acknowledge)
            </button>
            <button className="rounded-xl bg-white border border-navy-100 px-5 py-3 font-semibold min-h-[48px]" onClick={() => setWarning(null)}>Go back and fix</button>
          </div>
          <p className="text-xs text-neutral-500">Saving anyway records your acknowledgement with the exact clash list. Player checks only cover teams with verified rosters — unverified rosters are listed as incomplete coverage above.</p>
        </section>
      )}

      <section className="rounded-2xl border border-navy-100 bg-white p-4">
        <h2 className="font-display tracking-tight text-2xl font-bold mb-3">NEW FIXTURE</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl}>Division</label>
            <select className={inputCls} value={div?.id ?? ""} onChange={(e) => { setDivisionId(e.target.value); setEntryA(""); setEntryB(""); setPlacementEntries([]); }}>
              {myDivisions.map((d) => <option key={d.id} value={d.id}>{snap.sports.find((s) => s.id === d.sportId)?.name} — {d.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Label</label>
            <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Match 17" />
          </div>
          <div>
            <label className={lbl}>Stage</label>
            <select className={inputCls} value={stage} onChange={(e) => setStage(e.target.value as MatchStage)}>
              <option value="round_robin">Round robin / group</option>
              <option value="semifinal">Semifinal</option>
              <option value="bronze">Bronze match</option>
              <option value="gold">Gold match</option>
              <option value="placement">Placement</option>
              <option value="exhibition">Exhibition</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Group (optional)</label>
            <select className={inputCls} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">— none —</option>
              {snap.groups.filter((g) => g.divisionId === div?.id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Date & time (Manila)</label>
            <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Duration minutes (blank = sport default)</label>
            <input type="number" min={1} className={inputCls} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          {isPlacement ? (
            <div className="sm:col-span-2">
              <label className={lbl}>Entrants (placement event — tick everyone taking part)</label>
              <div className="flex flex-wrap gap-2">
                {divEntries.map((e) => {
                  const on = placementEntries.includes(e.id);
                  return (
                    <button key={e.id} type="button" aria-pressed={on}
                      className={`rounded-full px-3.5 py-2 text-sm font-semibold min-h-[44px] ${on ? "bg-navy-950 text-white" : "bg-white border border-navy-100"}`}
                      onClick={() => setPlacementEntries((prev) => on ? prev.filter((x) => x !== e.id) : [...prev, e.id])}>
                      {teamName(e.id)}
                    </button>
                  );
                })}
                {divEntries.length === 0 && <p className="text-sm text-neutral-500">No entries in this division yet.</p>}
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className={lbl}>Team A</label>
                <select className={inputCls} value={entryA} onChange={(e) => setEntryA(e.target.value)}>
                  <option value="">Pick a team…</option>
                  {divEntries.map((e) => <option key={e.id} value={e.id}>{teamName(e.id)}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Team B</label>
                <select className={inputCls} value={entryB} onChange={(e) => setEntryB(e.target.value)}>
                  <option value="">Pick a team…</option>
                  {divEntries.map((e) => <option key={e.id} value={e.id}>{teamName(e.id)}</option>)}
                </select>
              </div>
            </>
          )}
          <div>
            <label className={lbl}>Venue</label>
            <select className={inputCls} value={venueId} onChange={(e) => setVenueId(e.target.value)}>
              <option value="">— pick or type below —</option>
              {snap.venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Venue (free text, if not listed)</label>
            <input className={inputCls} value={venueText} onChange={(e) => setVenueText(e.target.value)} />
          </div>
        </div>
        <button disabled={busy} onClick={() => void submitCreate()} className="mt-4 rounded-xl bg-crimson-800 text-white px-6 py-3 font-bold min-h-[52px] disabled:opacity-60">
          Check & create fixture
        </button>
        <p className="text-xs text-neutral-500 mt-2">Every save is cross-checked event-wide: players on both teams against all fixtures in all sports, plus venue double-booking.</p>
      </section>

      <section className="rounded-2xl border border-navy-100 bg-white p-4">
        <h2 className="font-display tracking-tight text-2xl font-bold mb-3">ALL FIXTURES — MY SPORT{session.role === "admin" || scopeIds.length !== 1 ? "S" : ""}</h2>
        <ul className="divide-y divide-navy-100">
          {myMatches.map((m) => (
            <li key={m.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                <strong>{m.label}</strong> · {snap.divisions.find((d) => d.id === m.divisionId)?.name} · {fmtDay(m.startsAt)} {fmtTime(m.startsAt)} · {m.slots.map((s) => s.teamName ?? s.placeholder ?? "TBD").join(" vs ")}
                {m.conflictAck && <span className="ml-2 rounded bg-crimson-100 border border-crimson-600 px-1.5 py-0.5 text-[11px] font-semibold">conflict acknowledged</span>}
              </span>
              <span className="flex items-center gap-2">
                <StatusPill status={m.status} needsReview={m.needsReview} />
                {m.status === "scheduled" && (
                  <button className="rounded-lg bg-navy-800 text-white px-3 py-1.5 text-sm font-semibold min-h-[40px]"
                    onClick={() => startEdit(m)}>
                    Reschedule
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {editing && (
          <div className="mt-4 rounded-xl bg-navy-50 p-4 space-y-3">
            <h3 className="font-display tracking-tight text-lg font-bold">Reschedule — {editing.label}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className={lbl}>Label</label><input className={inputCls} value={editLabel} onChange={(e) => setEditLabel(e.target.value)} /></div>
              <div><label className={lbl}>New date & time (Manila)</label><input type="datetime-local" className={inputCls} value={editWhen} onChange={(e) => setEditWhen(e.target.value)} /></div>
              <div><label className={lbl}>Venue</label>
                <select className={inputCls} value={editVenueId} onChange={(e) => setEditVenueId(e.target.value)}>
                  <option value="">— free text / none —</option>
                  {snap.venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              {!editVenueId && (
                <div><label className={lbl}>Venue (free text)</label><input className={inputCls} value={editVenueText} onChange={(e) => setEditVenueText(e.target.value)} /></div>
              )}
            </div>
            {teamsEditable ? (
              <div>
                <label className={lbl}>Teams</label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {editing.slots.map((s, i) => (
                    <div key={s.slotNo}>
                      <label className={lbl}>{editing.slots.length > 2 ? `Entrant ${i + 1}` : i === 0 ? "Team A" : "Team B"}</label>
                      <select className={inputCls} value={editEntries[i] ?? ""} onChange={(e) => setEditEntries((prev) => prev.map((x, j) => j === i ? e.target.value : x))}>
                        <option value="">Pick a team…</option>
                        {snap.entries.filter((e) => e.divisionId === editing.divisionId).map((e) => <option key={e.id} value={e.id}>{teamName(e.id)}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 mt-1">Team changes are conflict-checked too (players + venue at the fixture&apos;s time).</p>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">This fixture&apos;s teams come from group ranks / earlier results, so they can&apos;t be changed directly.</p>
            )}
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => void submitEdit()} className="rounded-xl bg-navy-950 text-white px-5 py-3 font-bold min-h-[48px] disabled:opacity-60">Check & save</button>
              <button onClick={() => setEditing(null)} className="rounded-xl bg-white border border-navy-100 px-5 py-3 font-semibold min-h-[48px]">Cancel</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
