"use client";
import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toPng } from "html-to-image";
import { useSnapshot } from "../../../../lib/data/context";
import { manilaDayKey } from "../../../../lib/format";
import {
  entriesPoster,
  posterKind,
  schedulePosterDays,
} from "../../../../lib/posters";
import { EntriesPoster, SchedulePoster, POSTER_H, POSTER_W } from "../../../../components/Poster";

function PosterPageInner({ params }: { params: Promise<{ sport: string }> }) {
  const { sport: slug } = use(params);
  const snap = useSnapshot();
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sport = snap?.sports.find((s) => s.slug === slug) ?? null;
  const kind = snap && sport ? posterKind(snap, sport) : null;
  const days = useMemo(
    () => (snap && sport && kind === "schedule" ? schedulePosterDays(snap, sport) : []),
    [snap, sport, kind],
  );
  const entries = useMemo(
    () => (snap && sport && kind === "entries" ? entriesPoster(snap, sport) : null),
    [snap, sport, kind],
  );

  // Default day: today if matches are on, else the next match day, else the first.
  useEffect(() => {
    if (days.length === 0) return;
    setDayKey((prev) => {
      if (prev && days.some((d) => d.dayKey === prev)) return prev;
      const today = manilaDayKey(new Date().toISOString());
      return (
        days.find((d) => d.dayKey === today)?.dayKey ??
        days.find((d) => d.dayKey > today)?.dayKey ??
        days[0].dayKey
      );
    });
  }, [days]);

  // Callback ref: the preview only mounts after the snapshot loads, so a
  // mount-once effect would measure nothing and strand the scale.
  useEffect(() => {
    if (!wrapEl) return;
    const update = () => setScale(wrapEl.clientWidth / POSTER_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrapEl);
    return () => ro.disconnect();
  }, [wrapEl]);

  const activeDay = days.find((d) => d.dayKey === dayKey) ?? days[0] ?? null;

  async function download() {
    if (!posterRef.current || !sport) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await toPng(posterRef.current, {
        width: POSTER_W,
        height: POSTER_H,
        pixelRatio: 1,
        cacheBust: true,
      });
      const a = document.createElement("a");
      a.download = `pglulympics-${sport.slug}-poster${kind === "schedule" && activeDay ? `-${activeDay.dayKey}` : ""}.png`;
      a.href = dataUrl;
      a.click();
    } catch {
      setError("Download failed — try again, or screenshot the preview.");
    } finally {
      setBusy(false);
    }
  }

  if (!snap) {
    return <p className="text-neutral-500 py-10 text-center">Loading…</p>;
  }
  if (!sport) {
    return (
      <div className="py-10 text-center">
        <p className="text-navy-950 font-semibold">Sport not found.</p>
        <Link href="/posters" className="text-crimson-600 underline underline-offset-2">All posters</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/posters" className="text-sm font-medium text-crimson-600 underline underline-offset-2">
            ← All posters
          </Link>
          <h1 className="font-display tracking-tight text-4xl font-bold uppercase text-navy-950 mt-1">
            {sport.name} poster
          </h1>
          <p className="text-navy-900/70">
            {kind === "schedule" ? "Match schedule for the selected day." : "Official team entries."}{" "}
            Generated live from the portal data — scores and LIVE marks appear once games are on.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void download()}
          disabled={busy}
          className="min-h-[48px] rounded-xl bg-crimson-600 px-6 font-display text-xl font-semibold uppercase tracking-wide text-white disabled:opacity-60"
        >
          {busy ? "Rendering…" : "Download PNG"}
        </button>
      </header>

      {error && <p role="status" className="text-crimson-600 font-medium">{error}</p>}

      {kind === "schedule" && days.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {days.map((d) => (
            <button
              key={d.dayKey}
              type="button"
              onClick={() => setDayKey(d.dayKey)}
              className={`min-h-[44px] rounded-full px-4 font-medium ${
                d.dayKey === activeDay?.dayKey
                  ? "bg-navy-950 text-white"
                  : "bg-white border border-navy-100 text-navy-950"
              }`}
            >
              {d.dateLabel}
            </button>
          ))}
        </div>
      )}

      <div
        ref={setWrapEl}
        className="w-full overflow-hidden rounded-xl border border-navy-100 shadow-sm"
        style={{ height: POSTER_H * scale }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: POSTER_W, height: POSTER_H }}>
          <div ref={posterRef}>
            {kind === "schedule" && activeDay && (
              <SchedulePoster sport={sport} eventName={snap.event.name} day={activeDay} />
            )}
            {kind === "entries" && entries && (
              <EntriesPoster sport={sport} eventName={snap.event.name} data={entries} />
            )}
          </div>
        </div>
      </div>
      <p className="text-sm text-navy-900/60">PNG exports at 1920×1080 — ready for Facebook posting or print.</p>
    </div>
  );
}

export default function PosterPage(props: { params: Promise<{ sport: string }> }) {
  return (
    <Suspense fallback={<p className="text-neutral-500 py-10 text-center">Loading…</p>}>
      <PosterPageInner {...props} />
    </Suspense>
  );
}
