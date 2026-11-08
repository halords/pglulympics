"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useProvider, useSnapshot } from "../../../lib/data/context";
import { useSession } from "../../../lib/data/session";
import { getSupabase } from "../../../lib/supabase/client";
import { downloadCsvSkeleton, downloadRosterTemplate } from "../../../lib/roster-file";
import SheetSyncPanel from "../../../components/SheetSyncPanel";
import type { AdminRole, AdminUserRow } from "../../../lib/admin-users";
import type { AwardInfo, SportInfo } from "../../../lib/types";

/** Call the super-admin API with the current session's access token. The
 *  server re-validates the token + super_admin profile on every request. */
async function adminApi(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const sb = getSupabase();
  const { data } = sb ? await sb.auth.getSession() : { data: { session: null } };
  const token = data.session?.access_token;
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed (${res.status})`);
  return body;
}

function SportChecks({ sports, value, onChange }: { sports: SportInfo[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {sports.map((s) => {
        const on = value.includes(s.id);
        return (
          <button key={s.id} type="button" aria-pressed={on}
            className={`rounded-full px-3.5 py-2 text-sm font-semibold min-h-[40px] ${on ? "bg-navy-950 text-white" : "bg-white border border-navy-100"}`}
            onClick={() => onChange(on ? value.filter((x) => x !== s.id) : [...value, s.id])}>
            {s.name}
          </button>
        );
      })}
    </div>
  );
}

function UsersSection({ sports, isMock }: { sports: SportInfo[]; isMock: boolean }) {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AdminRole>("coordinator");
  const [sportIds, setSportIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<AdminRole>("coordinator");
  const [editSports, setEditSports] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);

  const refresh = async () => {
    const body = await adminApi("/api/admin/users");
    setUsers(body.users as AdminUserRow[]);
  };
  useEffect(() => {
    if (isMock) return;
    let alive = true;
    void (async () => {
      try {
        const body = await adminApi("/api/admin/users");
        if (alive) setUsers(body.users as AdminUserRow[]);
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "Failed to load users."); }
    })();
    const sb = getSupabase();
    if (sb) void sb.auth.getUser().then(({ data }) => { if (alive) setMyId(data.user?.id ?? null); });
    return () => { alive = false; };
  }, [isMock]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); setNotice(ok); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    setBusy(false);
  };
  const inputCls = "rounded-lg border border-navy-100 px-3 py-2 min-h-[44px] text-sm bg-white w-full";
  const lbl = "block text-sm font-semibold mb-1";
  const sportName = (id: string) => sports.find((s) => s.id === id)?.name ?? id;
  const editing = users?.find((u) => u.userId === editingId) ?? null;

  const startEdit = (u: AdminUserRow) => {
    setEditingId(u.userId);
    setEditName(u.displayName ?? "");
    setEditRole(u.role ?? "coordinator");
    setEditSports(u.sportIds);
    setEditActive(u.active);
    setError(null); setNotice(null);
  };

  return (
    <section className="rounded-2xl border border-navy-100 bg-white p-4">
      <h2 className="font-display tracking-tight text-2xl font-bold mb-2">USER ACCOUNTS</h2>
      {isMock ? (
        <p className="text-sm text-neutral-600">
          User management runs against the live Supabase project, so it is unavailable in demo mode.
          In production: create a coordinator here, assign one or more sports, and hand them the
          sign-in page — no dashboard or SQL needed. (The first super-admin is still bootstrapped
          once via SQL — see SETUP.md.)
        </p>
      ) : (
        <>
          <p className="text-sm text-neutral-600 mb-3">
            Create sign-ins and assign sports. A coordinator can handle <strong>several sports</strong> and a sport can
            have several coordinators. Deactivating an account blocks sign-in and removes its sport access immediately.
          </p>
          {error && <p className="rounded-lg bg-crimson-100 border border-crimson-600 text-crimson-800 px-3 py-2 text-sm mb-3">{error}</p>}
          {notice && <p className="rounded-lg bg-navy-50 border border-navy-100 px-3 py-2 text-sm mb-3">{notice}</p>}

          <form className="grid gap-3 sm:grid-cols-2 mb-5" onSubmit={(ev) => {
            ev.preventDefault();
            void run(async () => {
              await adminApi("/api/admin/users", {
                method: "POST",
                body: JSON.stringify({ email, password, displayName: displayName || null, role, sportIds: role === "coordinator" ? sportIds : [] }),
              });
              setEmail(""); setPassword(""); setDisplayName(""); setSportIds([]);
              await refresh();
            }, "User created — they can sign in right away.");
          }}>
            <div><label className={lbl}>Email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="off" /></div>
            <div><label className={lbl}>Temporary password (min 8 characters)</label><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} autoComplete="new-password" /></div>
            <div><label className={lbl}>Display name</label><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} /></div>
            <div><label className={lbl}>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)} className={inputCls}>
                <option value="coordinator">Coordinator</option>
                <option value="super_admin">Super admin</option>
              </select>
            </div>
            {role === "coordinator" && (
              <div className="sm:col-span-2"><label className={lbl}>Assigned sports</label><SportChecks sports={sports} value={sportIds} onChange={setSportIds} /></div>
            )}
            <div className="sm:col-span-2">
              <button disabled={busy} className="rounded-xl bg-crimson-800 text-white px-6 py-3 font-bold min-h-[48px] disabled:opacity-60">Create user</button>
            </div>
          </form>

          {!users && !error && <p className="text-sm text-neutral-500">Loading users…</p>}
          {users && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left border-b border-navy-100">
                    <th className="px-2 py-2">Email</th><th className="px-2 py-2">Name</th><th className="px-2 py-2">Role</th>
                    <th className="px-2 py-2">Sports</th><th className="px-2 py-2">Status</th><th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.userId} className="border-b border-navy-100 last:border-0 align-top">
                      <td className="px-2 py-2 font-medium break-all">{u.email}{u.userId === myId && <span className="text-neutral-500"> (you)</span>}</td>
                      <td className="px-2 py-2">{u.displayName ?? "—"}</td>
                      <td className="px-2 py-2">{u.role === "super_admin" ? "Super admin" : u.role === "coordinator" ? "Coordinator" : <span className="text-crimson-800 font-semibold">No profile</span>}</td>
                      <td className="px-2 py-2">
                        <span className="flex flex-wrap gap-1">
                          {u.role === "super_admin" ? <span className="text-neutral-500">All sports</span>
                            : u.sportIds.length ? u.sportIds.map((id) => <span key={id} className="rounded-full bg-navy-50 border border-navy-100 px-2 py-0.5 text-xs font-semibold">{sportName(id)}</span>)
                            : <span className="text-neutral-500">None</span>}
                        </span>
                      </td>
                      <td className="px-2 py-2">{u.active ? <span className="font-semibold">Active</span> : <span className="text-crimson-800 font-semibold">Deactivated</span>}</td>
                      <td className="px-2 py-2 text-right">
                        <button disabled={busy} className="rounded-lg bg-navy-800 text-white px-3 py-2 text-sm font-semibold min-h-[40px] disabled:opacity-60" onClick={() => startEdit(u)}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editing && (
            <div className="mt-4 rounded-xl bg-navy-50 p-4 space-y-3">
              <h3 className="font-display tracking-tight text-lg font-bold">Edit — {editing.email}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className={lbl}>Display name</label><input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputCls} /></div>
                <div><label className={lbl}>Role</label>
                  <select value={editRole} onChange={(e) => setEditRole(e.target.value as AdminRole)} className={inputCls}>
                    <option value="coordinator">Coordinator</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                </div>
              </div>
              {editRole === "coordinator" && (
                <div><label className={lbl}>Assigned sports</label><SportChecks sports={sports} value={editSports} onChange={setEditSports} /></div>
              )}
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={editActive} disabled={editing.userId === myId}
                  onChange={(e) => setEditActive(e.target.checked)} className="h-5 w-5" />
                Account active {editing.userId === myId && <span className="text-neutral-500">(you can&apos;t deactivate yourself)</span>}
              </label>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} className="rounded-xl bg-navy-950 text-white px-5 py-3 font-bold min-h-[48px] disabled:opacity-60"
                  onClick={() => void run(async () => {
                    const body = await adminApi(`/api/admin/users/${editing.userId}`, {
                      method: "PATCH",
                      body: JSON.stringify({ displayName: editName || null, role: editRole, sportIds: editRole === "coordinator" ? editSports : [], active: editActive }),
                    });
                    if (typeof body.warning === "string") setError(body.warning);
                    setEditingId(null);
                    await refresh();
                  }, "User updated.")}>
                  Save changes
                </button>
                <button disabled={busy} className="rounded-xl bg-white border border-navy-100 px-5 py-3 font-semibold min-h-[48px] disabled:opacity-60" onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

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
        <h1 className="font-display tracking-tight text-3xl font-bold text-navy-950">SUPER ADMIN</h1>
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
  const downloadTemplate = async () => {
    setBusy(true); setNotice(null);
    try {
      await downloadRosterTemplate(snap, snap.sports.map((s) => s.id));
      setNotice("Roster template downloaded — dropdowns baked from the live lists.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Template download failed."); }
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
        <h1 className="font-display tracking-tight text-4xl font-bold text-navy-950">SUPER ADMIN</h1>
        <Link href="/console" className="text-sm font-semibold text-navy-800 underline">Console →</Link>
      </header>
      {notice && <p className="rounded-lg bg-navy-50 border border-navy-100 px-3 py-2 text-sm">{notice}</p>}

      {/* reports */}
      <section className="rounded-2xl border border-navy-100 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display tracking-tight text-2xl font-bold">TOP 3 REPORT</h2>
          <p className="text-sm text-neutral-600">Winners of every sport and division from confirmed results — on screen, as a printable A4 document, or as an Excel file (Top 3 + Medal Tally sheets).</p>
        </div>
        <Link href="/admin/reports" className="rounded-xl bg-crimson-800 text-white px-5 py-3 font-bold text-sm min-h-[48px] inline-flex items-center">
          Open report →
        </Link>
      </section>

      <UsersSection sports={snap.sports} isMock={session.isMock} />

      <SheetSyncPanel isMock={session.isMock} />

      {/* reviews */}
      <section className="rounded-2xl border border-navy-100 bg-white p-4">
        <h2 className="font-display tracking-tight text-2xl font-bold mb-2">NEEDS-REVIEW QUEUE</h2>
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
        <h2 className="font-display tracking-tight text-2xl font-bold mb-2">MEDAL AWARDS — REVIEW & CONFIRM</h2>
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
        <h2 className="font-display tracking-tight text-2xl font-bold mb-2">ROSTERS & VERIFICATION</h2>
        <p className="text-sm text-neutral-600 mb-3">Add players to each team entry, then mark the roster <strong>verified</strong> — only verified rosters feed the conflict checker.</p>
        <div className="rounded-xl bg-navy-50 p-3 mb-4 space-y-2">
          <p className="text-sm"><strong>Bulk import:</strong> give encoders the controlled template — they type only player names and pick Sport / Team / Division from dropdowns, so those values can&apos;t be misspelled. The upload + preview + confirm flow lives on the console Roster page.</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} className="rounded-lg bg-navy-950 text-white px-4 py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-60" onClick={() => void downloadTemplate()}>
              Download roster template (.xlsx)
            </button>
            <button className="rounded-lg bg-white border border-navy-100 px-4 py-2.5 text-sm font-semibold min-h-[44px]" onClick={() => downloadCsvSkeleton()}>
              Download CSV skeleton
            </button>
            <Link href="/console/roster" className="rounded-lg bg-crimson-800 text-white px-4 py-2.5 text-sm font-semibold min-h-[44px] inline-flex items-center">
              Open bulk import →
            </Link>
          </div>
        </div>
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
                      <button disabled={busy} className={`rounded-full px-3 py-1 text-xs font-bold uppercase min-h-[36px] ${e.rosterStatus === "verified" ? "bg-navy-950 text-white" : "bg-crimson-100 border border-crimson-600 text-crimson-800"}`}
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
        <h2 className="font-display tracking-tight text-2xl font-bold">EVENT CONFIG</h2>
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
          <strong>Coordinator accounts</strong> are managed in the <strong>User Accounts</strong> section at the top of
          this page — create sign-ins and assign one or more sports per coordinator there. The service-role key
          stays on the server (the admin API re-checks your super-admin session on every call); it never ships
          to the browser. The old dashboard + SQL path remains only as a fallback in <strong>SETUP.md</strong>.
        </div>
      </section>
    </div>
  );
}
