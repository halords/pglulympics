"use client";
import { useEffect, useState } from "react";
import { getSupabase, resolveTransport } from "../supabase/client";

export interface SessionInfo {
  ready: boolean;
  role: "admin" | "coordinator" | null;
  /** Coordinator scope: the sports assigned in account_sport_assignments
   *  (migration 8). Empty for admins (role implies all sports) and sign-outs. */
  sportIds: string[];
  email: string | null;
  isMock: boolean;
}

const DEMO_KEY = "pglu-demo-role";
const SIGNED_OUT: Omit<SessionInfo, "ready" | "isMock"> = { role: null, sportIds: [], email: null };

/** Session resolution. Supabase mode: Auth user + account_profiles row
 *  (DB role 'super_admin' maps to session role 'admin'; an inactive profile
 *  resolves to no role) + the coordinator's assignment set.
 *  Mock mode: demo role stored in localStorage (public | coordinator | admin);
 *  demo scope is derived from the snapshot by the console pages (lib/scope). */
export function useSession(): SessionInfo & {
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
  setDemoRole(role: "admin" | "coordinator" | null): void;
} {
  const isMock = resolveTransport() === "mock";
  const [info, setInfo] = useState<SessionInfo>({ ready: false, role: null, sportIds: [], email: null, isMock });

  useEffect(() => {
    if (isMock) {
      const role = (typeof window !== "undefined" ? localStorage.getItem(DEMO_KEY) : null) as SessionInfo["role"];
      setInfo({ ready: true, role: role ?? null, sportIds: [], email: role ? `demo-${role}@pglulympics.local` : null, isMock });
      return;
    }
    const sb = getSupabase();
    if (!sb) { setInfo((i) => ({ ...i, ready: true })); return; }
    const load = async () => {
      const { data } = await sb.auth.getUser();
      const user = data.user;
      if (!user) { setInfo({ ready: true, ...SIGNED_OUT, isMock }); return; }
      const { data: profile } = await sb.from("account_profiles")
        .select("role, sport_id, active").eq("user_id", user.id).maybeSingle();
      const dbRole = profile?.active === false ? null : (profile?.role as string | undefined) ?? null;
      const role: SessionInfo["role"] = dbRole === "super_admin" ? "admin" : dbRole === "coordinator" ? "coordinator" : null;
      let sportIds: string[] = [];
      if (role === "coordinator") {
        const { data: assignments, error } = await sb.from("account_sport_assignments")
          .select("sport_id").eq("user_id", user.id);
        if (!error && assignments) {
          sportIds = assignments.map((a) => a.sport_id as string);
        } else if (profile?.sport_id) {
          // Transitional fallback: database has not applied migration 8 yet —
          // the legacy single-sport column still describes the scope.
          sportIds = [profile.sport_id as string];
        }
      }
      setInfo({ ready: true, role, sportIds, email: user.email ?? null, isMock });
    };
    void load();
    const { data: sub } = sb.auth.onAuthStateChange(() => void load());
    return () => sub.subscription.unsubscribe();
  }, [isMock]);

  return {
    ...info,
    async signIn(email, password) {
      const sb = getSupabase();
      if (!sb) return "Supabase is not configured in this environment.";
      const { error } = await sb.auth.signInWithPassword({ email, password });
      return error ? error.message : null;
    },
    async signOut() {
      if (isMock) {
        localStorage.removeItem(DEMO_KEY);
        setInfo({ ready: true, ...SIGNED_OUT, isMock });
        return;
      }
      const sb = getSupabase();
      if (sb) await sb.auth.signOut();
    },
    setDemoRole(role) {
      if (role) localStorage.setItem(DEMO_KEY, role); else localStorage.removeItem(DEMO_KEY);
      setInfo({ ready: true, role, sportIds: [], email: role ? `demo-${role}@pglulympics.local` : null, isMock });
    },
  };
}
