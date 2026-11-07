import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminUserRow } from "../admin-users";

// SERVER ONLY — never import from client components.
// The service-role key bypasses RLS, so every route using this module must
// first pass requireSuperAdmin(). The key is read from server env at request
// time and is never exposed to the browser or written to logs.

export function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Gate =
  | { ok: true; callerId: string; svc: SupabaseClient }
  | { ok: false; response: Response };

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });

/** Re-validate the caller on EVERY request: the Authorization bearer token
 *  must belong to a real auth user whose profile is an ACTIVE super_admin. */
export async function requireSuperAdmin(req: Request): Promise<Gate> {
  const svc = getServiceClient();
  if (!svc) return { ok: false, response: json(503, "User management is not configured on this server (missing service-role key).") };
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, response: json(401, "Sign-in required.") };
  const { data, error } = await svc.auth.getUser(token);
  if (error || !data.user) return { ok: false, response: json(401, "Sign-in required.") };
  const { data: profile } = await svc.from("account_profiles")
    .select("role, active").eq("user_id", data.user.id).maybeSingle();
  if (!profile || profile.role !== "super_admin" || profile.active === false) {
    return { ok: false, response: json(403, "Super-admin access required.") };
  }
  return { ok: true, callerId: data.user.id, svc };
}

interface ProfileRow { user_id: string; role: string | null; display_name: string | null; active: boolean; sport_id?: string | null }

/** All auth users joined with profiles + sport assignments. Falls back to the
 *  legacy single-sport column if the assignments table is not there yet
 *  (database pre-migration-8), so the page never hard-breaks during rollout. */
export async function listAdminUsers(svc: SupabaseClient): Promise<AdminUserRow[]> {
  const { data: list, error } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(error.message);
  const { data: profiles } = await svc.from("account_profiles").select("user_id, role, display_name, active, sport_id");
  const profileById = new Map<string, ProfileRow>(((profiles ?? []) as ProfileRow[]).map((p) => [p.user_id, p]));
  const sportsByUser = new Map<string, string[]>();
  const { data: assignments, error: assignError } = await svc.from("account_sport_assignments").select("user_id, sport_id");
  if (!assignError && assignments) {
    for (const a of assignments as { user_id: string; sport_id: string }[]) {
      const arr = sportsByUser.get(a.user_id) ?? [];
      arr.push(a.sport_id);
      sportsByUser.set(a.user_id, arr);
    }
  } else {
    for (const p of profileById.values()) if (p.sport_id) sportsByUser.set(p.user_id, [p.sport_id]);
  }
  return list.users.map((u) => {
    const p = profileById.get(u.id);
    return {
      userId: u.id,
      email: u.email ?? "",
      displayName: p?.display_name ?? null,
      role: p?.role === "super_admin" || p?.role === "coordinator" ? p.role : null,
      sportIds: sportsByUser.get(u.id) ?? [],
      active: p ? p.active !== false : false,
      createdAt: u.created_at,
    };
  });
}

export async function getAdminUserRow(svc: SupabaseClient, userId: string): Promise<AdminUserRow | null> {
  const rows = await listAdminUsers(svc);
  return rows.find((r) => r.userId === userId) ?? null;
}
