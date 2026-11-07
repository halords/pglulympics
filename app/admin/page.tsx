"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useProvider, useSnapshot } from "../../lib/data/context";
import { useSession } from "../../lib/data/session";
import type { AwardInfo } from "../../lib/types";

export default function AdminPage() {
  const snap = useSnapshot();
  const provider = useProvider();
  const session = useSession();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPlayer, setNewPlayer] = useState<Record<string, string>>({});
  const [points, setPoints] = useState<{ g: string; s: string; b: string; prov: boolean } | null>(null);
  const [durations, setDurations] = useState<Record<string, string>>({});

  const draftsByDivision = useMemo(() => {
    if (!snap) return [];
    return snap.divisions.map((div) => ({
      div,
      drafts: snap.awards.filter((a) => a.divisionId === div.id && a.state === "draft"),
      confirmed: snap.awards.filter((a) => a.divisionId === div.id && a.state === "confirmed"),
    })).filter((x) => x.drafts.length || x.confirmed.length);
  }, [snap]);

  if (!session.ready || !snap) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;
  if (session.role !== "admin") {
    return (
      <div className="max-w-md mx-auto text-center space-y-3 py-8">
        <h1 className="font-display text-3xl font-bold text-navy-950">SUPER ADMIN</h1>
        <p className="text-neutral-600">This area is for the super-admin account only.</p>
        <Link href="/login" className="inline-block rounded-xl bg-navy-950 text-white px-6 py-3 font-semibold">Go to sign-in</Link>
      </div>
    );
  }

  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setNotice(null);
    try { await fn(); setNotice(ok); } catch (e) { setNotice(e instanceof Error ? e.message : "Failed"); }
    setBusy(false);
  };
  const teamName = (entryId: string) => {
    const e = snap.entries.find((x) => x.id === entryId);
    return e ? snap.teams.find((t) => t.id === e.teamId)?.name ?? entryId : entryId;
  };
  const p = points ?? { g: String(snap.event.goldPoints), s: String(snap.event.silverPoints), b: String(snap.event.bronzePoints), prov: snap.event.pointsProvisional };
  const inputCls = "rounded-lg border border-navy-100 px-3 py-2 min-h-[44px] text-sm bg-white";

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-4xl font-bold text-navy-950">SUPER ADMIN</h1>
        <Link href="/console" className="text-sm font-semibold text-navy-800 underline">Console →</Link>
      </header>
      {notice && <p className="rounded-lg bg-navy-50 border border-navy-100 px-3 py-2 text-sm">{notice}</p>}

      {/* reviews */}
      <section className="rounded-2xl border border-navy-100 bg-white p-4">
        <h2 className="font-display text-2xl font-bold mb-2">NEEDS-REVIEW QUEUE</h2>
        {snap.matches.filter((m) => m.needsReview).length === 0 && <p className="text-sm text-neutral-500">Nothing flagged. ✓</p>}
        {snap.matches.filter((m) => m.needsReview).map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-t border-navy-100 first:border-0">
            <span className="text-sm"><strong>{m.label}</strong> — {snap.divisions.find((d) => d.id === m.divisionId)?.name} · {m.slots.map((s) => s.teamName ?? "TBD").join(" vs ")}</span>
            <span className="flex gap-2">
              <Link href={`/console/matches/${m.id}`} className="rounded-lg bg-navy-800 text-white px-3 py-2 text-sm font-semibold min-h-[40px] inline-flex items-center">Open</Link>
              <button disabled={busy} className="rounded-lg bg-white border border-crimson-800 text-crimson-800 px-3 py-2 text-sm font-semibold min-h-[40px] disabled:opacity-60"
                onClick={() => { if (confirm("Reset this match and everything built on it?")) void act(() => provider.resetMatch(m.id, "admin reset from review queue"), "Match reset."); }}>
                Reset
              </button>
            </span>
          </div>
        ))}
      </section>

      {/* awards */}
      <section className="rounded-2xl border border-navy-100 bg-white p-4">
        <h2 className="font-display text-2xl font-bold mb-2">MEDAL AWARDS — REVIEW & CONFIRM</h2>
        <p className="text-sm text-neutral-600 mb-2">Finals propose draft medals automatically. Only <strong>confirmed</strong> medals appear on the public tally. Confirming replaces the division&apos;s confirmed set atomically.</p>
        {draftsByDivision.length === 0 && <p className="text-sm text-neutral-500">No medal drafts yet — they appear when gold/bronze finals finish.</p>}
        {draftsByDivision.map(({ div, drafts, confirmed }) => (
          <div key={div.id} className="border-t border-navy-100 py-3 first:border-0">
            <h3 className="font-semibold">{snap.sports.find((s) => s.id === div.sportId)?.name} — {div.name}</h3>
            <ul className="text-sm mt-1 space-y-0.5">
              {drafts.map((a) => <li key={a.awardKey}>📝 draft — {a.medal === "gold" ? "🥇" : a.medal === "silver" ? "🥈" : "🥉"} {teamName(a.entryId)}</li>)}
              {confirmed.map((a) => <li key={a.awardKey}>✅ confirmed — {a.medal === "gold" ? "🥇" : a.medal === "silver" ? "🥈" : "🥉"} {teamName(a.entryId)}</li>)}
            </ul>
            {drafts.length > 0 && (
              <button disabled={busy} className="mt-2 rounded-xl bg-navy-950 text-white px-5 py-2.5 font-bold text-sm min-h-[44px] disabled:opacity-60"
                onClick={() => void act(async () => {
                  const merged = new Map<string, { awardKey: string; medal: AwardInfo["medal"]; entryId: string; source?: string }>();
                  for (const a of [...confirmed, ...drafts]) merged.set(a.awardKey, { awardKey: a.awardKey, medal: a.medal, entryId: a.entryId, source: a.source });
                  await provider.confirmAwards(div.id, [...merged.values()]);
                }, `Medals confirmed for ${div.name} — public tally updated.`)}>
                Confirm medals for {div.name}
              </button>
            )}
          </div>
        ))}
      </section>

      {/* rosters */}
      <section className="rounded-2xl border border-navy-100 bg-white p-4">
        <h2 className="font-display text-2xl font-bold mb-2">ROSTERS & VERIFICATION</h2>
        <p className="text-sm text-neutral-600 mb-3">Add players to each team entry, then mark the roster <strong>verified</strong> — only verified rosters feed the conflict checker.</p>
        <div className="space-y-4">
          {snap.divisions.map((div) => (
            <div key={div.id}>
              <h3 className="font-semibold mb-1">{div.name}</h3>
              {snap.entries.filter((e) => e.divisionId === div.id).map((e) => {
                const members = snap.rosters[e.id] ?? [];
                return (
                  <div key={e.id} className="rounded-xl bg-navy-50 p-3 mb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm">{teamName(e.id)}</strong>
                      <button disabled={busy} className={`rounded-full px-3 py-1 text-xs font-bold uppercase min-h-[36px] ${e.rosterStatus === "verified" ? "bg-navy-950 text-white" : "bg-gold-100 border border-gold-500 text-gold-500"}`}
                        onClick={() => void act(() => provider.setEntryRosterStatus(e.id, e.rosterStatus === "verified" ? "unknown" : "verified"), "Roster status updated.")}>
                        {e.rosterStatus}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {members.map((pid) => {
                        const pl = snap.players.find((x) => x.id === pid);
                        return (
                          <span key={pid} className="inline-flex items-center gap-1 rounded-full bg-white border border-navy-100 px-2.5 py-1 text-xs font-medium">
                            {pl?.name ?? pid}
                            <button aria-label={`Remove ${pl?.name}`} className="text-crimson-800 font-bold"
                              onClick={() => void act(() => provider.setEntryRoster(e.id, members.filter((x) => x !== pid)), "Player removed.")}>×</button>
                          </span>
                        );
                      })}
                      {members.length === 0 && <span className="text-xs text-neutral-500">No players yet.</span>}
                    </div>
                    <form className="flex gap-2 mt-2" onSubmit={(ev) => {
                      ev.preventDefault();
                      const name = (newPlayer[e.id] ?? "").trim();
                      if (!name) return;
                      void act(async () => {
                        const player = await provider.upsertPlayer(name);
                        await provider.setEntryRoster(e.id, [...members, player.id]);
                        setNewPlayer((s) => ({ ...s, [e.id]: "" }));
                      }, `Added ${name}.`);
                    }}>
                      <input value={newPlayer[e.id] ?? ""} onChange={(ev) => setNewPlayer((s) => ({ ...s, [e.id]: ev.target.value }))}
                        placeholder="Player full name" className={`${inputCls} flex-1`} />
                      <button disabled={busy} className="rounded-lg bg-navy-800 text-white px-4 py-2 text-sm font-semibold min-h-[44px] disabled:opacity-60">Add</button>
                    </form>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* config */}
      <section className="rounded-2xl border border-navy-100 bg-white p-4 space-y-5">
        <h2 className="font-display text-2xl font-bold">EVENT CONFIG</h2>
        <div>
          <h3 className="font-semibold mb-2">Medal points (overall tally)</h3>
          <div className="flex flex-wrap items-end gap-3">
            {(["g", "s", "b"] as const).map((k) => (
              <label key={k} className="text-sm font-medium">
                {k === "g" ? "Gold" : k === "s" ? "Silver" : "Bronze"}
                <input type="number" min={0} value={p[k]} onChange={(e) => setPoints({ ...p, [k]: e.target.value })} className={`${inputCls} block w-24 mt-1`} />
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm font-medium pb-2">
              <input type="checkbox" checked={p.prov} onChange={(e) => setPoints({ ...p, prov: e.target.checked })} className="h-5 w-5" />
              Provisional (show the badge publicly)
            </label>
            <button disabled={busy} className="rounded-lg bg-navy-950 text-white px-4 py-2.5 font-semibold text-sm min-h-[44px] disabled:opacity-60"
              onClick={() => void act(() => provider.updateEventPoints({ goldPoints: Number(p.g), silverPoints: Number(p.s), bronzePoints: Number(p.b), pointsProvisional: p.prov }), "Medal points saved.")}>
              Save points
            </button>
          </div>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Default match duration per sport (conflict-check window)</h3>
          {snap.sports.map((sp) => (
            <div key={sp.id} className="flex items-center gap-3 py-1">
              <span className="w-36 text-sm font-medium">{sp.name}</span>
              <input type="number" min={1} value={durations[sp.id] ?? String(sp.defaultDurationMinutes)}
                onChange={(e) => setDurations((s) => ({ ...s, [sp.id]: e.target.value }))} className={`${inputCls} w-24`} />
              <span className="text-sm text-neutral-500">minutes</span>
              <button disabled={busy} className="rounded-lg bg-navy-800 text-white px-3 py-2 text-sm font-semibold min-h-[40px] disabled:opacity-60"
                onClick={() => void act(() => provider.updateSportDuration(sp.id, Number(durations[sp.id] ?? sp.defaultDurationMinutes)), "Duration saved.")}>
                Save
              </button>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-navy-50 p-3 text-sm">
          <strong>Coordinator accounts</strong> are created in the Supabase dashboard (Authentication → Users) and scoped
          by inserting a row into <code>account_profiles</code> — step-by-step in <strong>SETUP.md</strong>. Accounts are
          never managed from this page (no service-role key ever ships to the browser).
        </div>
      </section>
    </div>
  );
}
