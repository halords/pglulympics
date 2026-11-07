"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../../../lib/data/session";

export default function LoginPage() {
  const session = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session.isMock) {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="font-display tracking-tight text-4xl font-bold text-navy-950">STAFF SIGN-IN</h1>
        <div className="rounded-xl border border-crimson-600 bg-crimson-100 p-4 text-sm">
          <strong>Demo mode.</strong> No Supabase keys are configured in this environment, so sign-in runs on local
          demo identities. Pick a role to explore the console — data is stored in this browser only.
        </div>
        <div className="grid gap-3">
          <button
            className="rounded-xl bg-navy-950 text-white py-3.5 font-semibold min-h-[52px]"
            onClick={() => { session.setDemoRole("coordinator"); router.push("/console"); }}
          >Sign in as Volleyball Coordinator (demo)</button>
          <button
            className="rounded-xl bg-crimson-800 text-white py-3.5 font-semibold min-h-[52px]"
            onClick={() => { session.setDemoRole("admin"); router.push("/admin"); }}
          >Sign in as Super Admin (demo)</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="font-display tracking-tight text-4xl font-bold text-navy-950">STAFF SIGN-IN</h1>
      <p className="text-neutral-600 text-sm">Coordinators and admins sign in with the account created for them in Supabase. Each coordinator account is scoped to one sport.</p>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError(null);
          const err = await session.signIn(email, password);
          setBusy(false);
          if (err) setError(err); else router.push("/console");
        }}
      >
        <label className="block">
          <span className="text-sm font-semibold">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-navy-100 px-3 py-2.5 min-h-[48px]" autoComplete="email" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Password</span>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-navy-100 px-3 py-2.5 min-h-[48px]" autoComplete="current-password" />
        </label>
        {error && <p className="rounded-lg bg-crimson-800/10 border border-crimson-800 text-crimson-800 px-3 py-2 text-sm">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-crimson-800 text-white py-3.5 font-semibold min-h-[52px] disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
