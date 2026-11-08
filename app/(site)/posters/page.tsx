"use client";
import Link from "next/link";
import { useSnapshot } from "../../../lib/data/context";
import { entriesPoster, posterKind, schedulePosterDays } from "../../../lib/posters";
import { sportIdentity, SportIcon } from "../../../lib/sport-identity";

export default function PostersPage() {
  const snap = useSnapshot();

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[11px] uppercase tracking-[0.25em] text-crimson-600 font-bold">PGLUlympics</p>
        <h1 className="font-display tracking-tight text-5xl font-bold uppercase text-navy-950">Posters</h1>
        <p className="mt-2 max-w-2xl text-navy-900/70">
          Official announcement posters in the portal&apos;s branding — match schedules per day and
          team entry lists, generated live from the same data as this site. Open a sport and download
          the PNG (1920×1080) to post or print.
        </p>
      </header>

      {!snap ? (
        <p className="text-neutral-500 py-10 text-center">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {snap.sports.map((sport) => {
            const kind = posterKind(snap, sport);
            const meta =
              kind === "schedule"
                ? `${schedulePosterDays(snap, sport).length} match day(s)`
                : `${entriesPoster(snap, sport).enteredCount} entries`;
            const identity = sportIdentity(sport);
            return (
              <Link
                key={sport.id}
                href={`/posters/${sport.slug}`}
                className="group overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="h-1.5" style={{ backgroundColor: identity.tint }} />
                <div className="flex items-center gap-4 px-5 py-5">
                  <span
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white"
                    style={{ backgroundColor: identity.tint }}
                  >
                    <SportIcon sport={sport} className="h-8 w-8" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-2xl font-bold uppercase leading-none text-navy-950">
                      {sport.name}
                    </p>
                    <p className="mt-1 text-sm text-navy-900/60">
                      {kind === "schedule" ? "Schedule poster" : "Entries poster"} · {meta}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 whitespace-nowrap font-display text-lg font-semibold uppercase tracking-wide text-crimson-600 group-hover:underline">
                    Open →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
