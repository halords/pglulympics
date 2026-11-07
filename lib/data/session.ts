"use client";
import { useEffect, useState } from "react";
import { getSupabase, resolveTransport } from "../supabase/client";

export interface SessionInfo {
  ready: boolean;
  role: "admin" | "coordinator" | null;
  sportId: string | null; // coordinator scope; null = all (admin)
  email: string | null;
  isMock: boolean;
}

const DEMO_KEY = "pglu-demo-role";

/** Session resolution. Supabase mode: Auth user + account_profiles row.
 *  Mock mode: demo role stored in localStorage (public | coordinator | admin). */
export function useSession(): SessionInfo & {
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
  setDemoRole(role: "admin" | "coordinator" | null): void;
} {
  const isMock = resolveTransport() === "mock";
  const [info, setInfo] = useState<SessionInfo>({ ready: false, role: null, sportId: null, email: null, isMock });

  useEffect(() => {
    if (isMock) {
      const role = (typeof window !== "undefined" ? localStorage.getItem(DEMO_KEY) : null) as SessionInfo["role"];
      setInfo({ ready: true, role: role ?? null, sportId: null, email: role ? `demo-${role}@pglulympics.local` : null, isMock });
      return;
    }
    const sb = getSupabase();
    if (!sb) { setInfo((i) => ({ ...i, ready: true })); return; }
    const load = async () => {
      const { data } = await sb.auth.getUser();
      const user = data.user;
      if (!user) { setInfo({ ready: true, role: null, sportId: null, email: null, isMock }); return; }
      const { data: profile } = await sb.from("account_profiles").select("role, sport_id").eq("user_id", user.id).maybeSingle();
      setInfo({
        ready: true,
        role: (profile?.role as SessionInfo["role"]) ?? null,
        sportId: (profile?.sport_id as string) ?? null,
        email: user.email ?? null, isMock,
      });
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
        setInfo({ ready: true, role: null, sportId: null, email: null, isMock });
        return;
      }
      const sb = getSupabase();
      if (sb) await sb.auth.signOut();
    },
    setDemoRole(role) {
      if (role) localStorage.setItem(DEMO_KEY, role); else localStorage.removeItem(DEMO_KEY);
      setInfo({ ready: true, role, sportId: null, email: role ? `demo-${role}@pglulympics.local` : null, isMock });
    },
  };
}
