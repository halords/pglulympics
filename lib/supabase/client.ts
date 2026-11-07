import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Browser Supabase client. Key name: NEW Supabase naming first
 *  (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY), legacy anon key as fallback. */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key);
  return client;
}

export type Transport = "mock" | "realtime" | "polling";

export function resolveTransport(): Transport {
  const t = process.env.NEXT_PUBLIC_DATA_TRANSPORT;
  if (t === "mock" || t === "realtime" || t === "polling") return t;
  return process.env.NEXT_PUBLIC_SUPABASE_URL ? "realtime" : "mock";
}
