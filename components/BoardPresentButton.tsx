"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Discreet Present control for the chromeless board screens (/board/…):
// one tap requests fullscreen + a Screen Wake Lock so a courtside tablet
// or laptop propped up for the players doesn't sleep mid-game. It
// auto-hides after ~3s without pointer movement (move/tap brings it
// back), exactly like the /display control cluster. Everything degrades
// silently where an API is missing (older tablet browsers, embedded
// webviews) — the toggle simply keeps whatever did engage.

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

export default function BoardPresentButton() {
  const [visible, setVisible] = useState(true);
  const [presenting, setPresenting] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const lockRef = useRef<WakeLockSentinelLike | null>(null);
  const presentingRef = useRef(false);

  const poke = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setVisible(false), 3000);
  }, []);

  useEffect(() => {
    const kick = window.setTimeout(poke, 0);
    window.addEventListener("pointermove", poke);
    window.addEventListener("pointerdown", poke);
    return () => {
      window.clearTimeout(kick);
      window.removeEventListener("pointermove", poke);
      window.removeEventListener("pointerdown", poke);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [poke]);

  const requestLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
      };
      if (!nav.wakeLock) return;
      lockRef.current = await nav.wakeLock.request("screen");
    } catch {
      /* wake lock is a nice-to-have — stay silent */
    }
  }, []);

  // Wake locks drop automatically when the tab is hidden; re-arm on
  // return while presenting.
  useEffect(() => {
    const onVis = () => {
      if (
        document.visibilityState === "visible"
        && presentingRef.current
        && (!lockRef.current || lockRef.current.released)
      ) {
        void requestLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [requestLock]);

  // Keep the toggle honest when the viewer exits fullscreen themselves
  // (Esc / OS gesture): presenting ends and the lock is released too.
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement && presentingRef.current) {
        presentingRef.current = false;
        setPresenting(false);
        const lock = lockRef.current;
        lockRef.current = null;
        void lock?.release().catch(() => {});
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggle = async () => {
    poke();
    if (presentingRef.current) {
      presentingRef.current = false;
      setPresenting(false);
      const lock = lockRef.current;
      lockRef.current = null;
      try { await lock?.release(); } catch { /* noop */ }
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* noop */ }
      return;
    }
    presentingRef.current = true;
    setPresenting(true);
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      /* unsupported here — the wake lock may still hold the screen on */
    }
    await requestLock();
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={presenting}
      className={`fixed bottom-[2vh] right-[2vw] z-20 inline-flex min-h-[44px] items-center gap-2 rounded-md border border-navy-700 bg-navy-900/85 px-4 py-2 font-display tracking-tight text-sm font-bold uppercase text-navy-100 transition-opacity duration-500 hover:bg-navy-800 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
      </svg>
      {presenting ? "Presenting" : "Present"}
    </button>
  );
}
