// Sheet sync — live SyncStore over the service-role client (SERVER ONLY).
// Reads hit the base tables (service role bypasses RLS); writes go through
// the SAME RPCs the console uses (update_fixture / save_score /
// set_match_status) so propagation, award drafts and realtime emission are
// identical to a coordinator's own edits. Entry writes are plain DML —
// the provider's admin facet already writes division_entries-adjacent
// tables directly under the service key.
//
// Authorization note: the RPCs assert a staff caller via auth.uid();
// migration 11 teaches _assert_match_writer to also accept the
// service_role (this engine only ever runs behind the super-admin gate).
// Until migration 11 lands, RPC writes raise 42501 — the engine records
// each as a FAILED change with that reason and the run completes.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SyncDbState, SyncLogRow, SyncMatch, SyncStore,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));

export function createLiveSyncStore(svc: SupabaseClient): SyncStore {
  async function assembleMatches(matchIds?: string[]): Promise<{ matches: SyncMatch[]; entryTeam: Map<string, string | null> }> {
    const [entriesRes, teamsRes, venuesRes] = await Promise.all([
      svc.from("division_entries").select("id, team_id"),
      svc.from("teams").select("id, name"),
      svc.from("venues").select("id, name"),
    ]);
    const teamName = new Map(((teamsRes.data ?? []) as Row[]).map((t) => [s(t.id)!, s(t.name)!]));
    const venueName = new Map(((venuesRes.data ?? []) as Row[]).map((v) => [s(v.id)!, s(v.name)!]));
    const entryTeam = new Map(((entriesRes.data ?? []) as Row[]).map((e) => [s(e.id)!, teamName.get(s(e.team_id)!) ?? null]));

    let mq = svc.from("matches").select("*");
    if (matchIds) mq = mq.in("id", matchIds);
    const [mts, slots, segs, segScores, totals, places] = await Promise.all([
      mq,
      svc.from("match_slots").select("*"),
      svc.from("match_segments").select("*"),
      svc.from("segment_scores").select("*"),
      svc.from("match_totals").select("*"),
      svc.from("placement_results").select("*"),
    ]);
    const slotsByMatch = new Map<string, Row[]>();
    for (const sl of (slots.data ?? []) as Row[]) {
      const arr = slotsByMatch.get(s(sl.match_id)!) ?? [];
      arr.push(sl); slotsByMatch.set(s(sl.match_id)!, arr);
    }
    const slotEntry = (sl: Row) => s(sl.frozen_entry_id) ?? s(sl.override_entry_id) ?? s(sl.resolved_entry_id) ?? s(sl.source_entry_id);
    const scoreBySegSlot = new Map<string, number>();
    for (const sc of (segScores.data ?? []) as Row[]) scoreBySegSlot.set(`${sc.segment_id}:${sc.slot_id}`, Number(sc.points ?? 0));
    const matches: SyncMatch[] = ((mts.data ?? []) as Row[]).map((m) => {
      const mid = s(m.id)!;
      const mSlots = (slotsByMatch.get(mid) ?? []).sort((a, b) => Number(a.slot_no) - Number(b.slot_no));
      const sets = ((segs.data ?? []) as Row[])
        .filter((sg) => sg.match_id === mid && sg.status === "closed")
        .sort((a, b) => Number(a.segment_no) - Number(b.segment_no))
        .map((sg) => ({
          points: [
            scoreBySegSlot.get(`${sg.id}:${mSlots[0]?.id}`) ?? 0,
            scoreBySegSlot.get(`${sg.id}:${mSlots[1]?.id}`) ?? 0,
          ] as [number, number],
        }));
      const mTotals = ((totals.data ?? []) as Row[]).filter((t) => t.match_id === mid);
      const totalsPair: [number, number] | null = mTotals.length
        ? [Number(mTotals.find((t) => t.slot_id === mSlots[0]?.id)?.points ?? 0),
           Number(mTotals.find((t) => t.slot_id === mSlots[1]?.id)?.points ?? 0)]
        : null;
      return {
        id: mid, divisionId: s(m.division_id)!, label: s(m.label)!,
        stage: s(m.stage)!, status: m.status as SyncMatch["status"],
        startsAt: s(m.starts_at), durationMinutes: (m.duration_minutes as number) ?? null,
        venueId: s(m.venue_id), venueName: s(m.venue_text) ?? (m.venue_id ? venueName.get(s(m.venue_id)!) ?? null : null),
        slots: mSlots.map((sl) => {
          const eid = slotEntry(sl);
          return { entryId: eid, teamName: eid ? entryTeam.get(eid) ?? null : null };
        }),
        sets, totals: totalsPair,
        placements: ((places.data ?? []) as Row[]).filter((p) => p.match_id === mid)
          .map((p) => {
            const sl = mSlots.find((x) => x.id === p.slot_id);
            return { entryId: sl ? slotEntry(sl) : null, place: (p.place as number) ?? null };
          }),
        winnerEntryId: s(m.winner_entry_id), revision: Number(m.revision ?? 0),
      };
    });
    return { matches, entryTeam };
  }

  return {
    async getState(): Promise<SyncDbState> {
      const [sports, divisions, teams, groups, venues, entries, results] = await Promise.all([
        svc.from("sports").select("id, slug"),
        svc.from("divisions").select("id, sport_id, name, slug, scoring_kind, scoring_config"),
        svc.from("teams").select("id, name"),
        svc.from("groups").select("id, division_id, name"),
        svc.from("venues").select("id, name"),
        svc.from("division_entries").select("id, division_id, team_id, group_id, active"),
        svc.from("division_results").select("division_id, state"),
      ]);
      const sportSlug = new Map(((sports.data ?? []) as Row[]).map((x) => [s(x.id)!, s(x.slug)!]));
      const { matches } = await assembleMatches();
      const confirmedDivisions = new Set<string>();
      for (const r of (results.data ?? []) as Row[]) {
        if (r.state === "confirmed") confirmedDivisions.add(s(r.division_id)!);
      }
      return {
        divisions: ((divisions.data ?? []) as Row[]).map((d) => ({
          id: s(d.id)!, sportId: s(d.sport_id)!, sportSlug: sportSlug.get(s(d.sport_id)!) ?? "",
          name: s(d.name)!, slug: s(d.slug)!,
          scoringKind: d.scoring_kind as SyncDbState["divisions"][number]["scoringKind"],
          bestOf: ((d.scoring_config as Row | null)?.best_of as number) ?? null,
        })),
        teams: ((teams.data ?? []) as Row[]).map((t) => ({ id: s(t.id)!, name: s(t.name)! })),
        groups: ((groups.data ?? []) as Row[]).map((g) => ({ id: s(g.id)!, divisionId: s(g.division_id)!, name: s(g.name)! })),
        venues: ((venues.data ?? []) as Row[]).map((v) => ({ id: s(v.id)!, name: s(v.name)! })),
        entries: ((entries.data ?? []) as Row[]).map((e) => ({
          id: s(e.id)!, divisionId: s(e.division_id)!, teamId: s(e.team_id)!,
          groupId: s(e.group_id), active: e.active !== false,
        })),
        matches, confirmedDivisions,
      };
    },

    async getMatch(matchId: string): Promise<SyncMatch | null> {
      const { matches } = await assembleMatches([matchId]);
      return matches[0] ?? null;
    },

    async updateFixtureSchedule(matchId, input) {
      const { data, error } = await svc.rpc("update_fixture", {
        p_match_id: matchId, p_starts_at: input.startsAt,
        p_duration_minutes: input.durationMinutes, p_venue_id: input.venueId,
        p_venue_text: input.venueText, p_label: null, p_ack_hash: null,
      });
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as Row;
      return r.status === "warning" ? { status: "warning" as const } : { status: "ok" as const };
    },

    async saveScore(matchId, expectedRevision, payload) {
      const { data, error } = await svc.rpc("save_score", {
        p_match_id: matchId, p_expected_revision: expectedRevision, p_payload: payload,
      });
      if (error) throw new Error(error.message);
      return { revision: Number((data as Row).revision ?? expectedRevision + 1) };
    },

    async setMatchStatus(matchId, status, opts) {
      const { data, error } = await svc.rpc("set_match_status", {
        p_match_id: matchId, p_status: status, p_outcome: opts?.outcome ?? null,
        p_winner_entry_id: null, p_reason: "sheet-sync",
      });
      if (error) throw new Error(error.message);
      return { revision: Number((data as Row).revision ?? 0) };
    },

    async addEntry(divisionId, teamId, groupId) {
      const { data, error } = await svc.from("division_entries")
        .insert({ division_id: divisionId, team_id: teamId, group_id: groupId })
        .select("id").single();
      if (error) throw new Error(error.message);
      return { entryId: s((data as Row).id)! };
    },

    async setEntryActive(entryId, active) {
      const { error } = await svc.from("division_entries").update({ active }).eq("id", entryId);
      if (error) throw new Error(error.message);
    },

    async setEntryGroup(entryId, groupId) {
      const { error } = await svc.from("division_entries").update({ group_id: groupId }).eq("id", entryId);
      if (error) throw new Error(error.message);
    },

    async writeLog(runId, rows: SyncLogRow[]): Promise<boolean> {
      const { error } = await svc.from("sheet_sync_log").insert(rows.map((r) => ({
        run_id: runId, kind: r.kind, fixture_id: r.fixtureId, division_id: r.divisionId,
        field: r.field, old_value: r.oldValue, new_value: r.newValue,
        source_ref: r.sourceRef, detail: r.detail,
      })));
      return !error;
    },

    async readLog(limit) {
      const { data, error } = await svc.from("sheet_sync_log")
        .select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) return null;
      const rows = ((data ?? []) as Row[]).map((r) => ({
        kind: r.kind as SyncLogRow["kind"], fixtureId: s(r.fixture_id), divisionId: s(r.division_id),
        field: s(r.field), oldValue: s(r.old_value), newValue: s(r.new_value),
        sourceRef: s(r.source_ref), detail: s(r.detail),
        runId: s(r.run_id)!, createdAt: s(r.created_at)!,
      }));
      return { rows, lastRun: rows.find((r) => r.kind === "run_summary") ?? null };
    },
  };
}
