"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DataProvider, Snapshot } from "../types";
import { MockProvider } from "./mock";
import { SupabaseProvider } from "./supabase";
import { getSupabase, resolveTransport } from "../supabase/client";

const Ctx = createContext<{ provider: DataProvider; snapshot: Snapshot | null; error: string | null }>({
  provider: null as unknown as DataProvider, snapshot: null, error: null,
});

export function DataRoot({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const providerRef = useRef<DataProvider | null>(null);
  if (!providerRef.current) {
    const transport = resolveTransport();
    const sb = getSupabase();
    providerRef.current = transport !== "mock" && sb
      ? new SupabaseProvider(sb, transport)
      : new MockProvider();
  }
  const provider = providerRef.current;
  useEffect(() => {
    let alive = true;
    provider.getSnapshot()
      .then((s) => { if (alive) setSnapshot(s); })
      .catch((e: Error) => { if (alive) setError(e.message); });
    const unsub = provider.subscribe((s) => { if (alive) setSnapshot(s); });
    return () => { alive = false; unsub(); };
  }, [provider]);
  const value = useMemo(() => ({ provider, snapshot, error }), [provider, snapshot, error]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() { return useContext(Ctx); }
export function useSnapshot(): Snapshot | null { return useContext(Ctx).snapshot; }
export function useProvider(): DataProvider { return useContext(Ctx).provider; }
