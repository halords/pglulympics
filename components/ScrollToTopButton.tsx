"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Floating back-to-top button for the public site chrome ((site) layout).
// Appears once the reader is well down a long page (schedule, standings,
// posters, team lists) and smooth-scrolls back to the top. Hidden on the
// courtside scoring screens (/console/matches/…), whose pinned bottom
// action bar owns the bottom edge of the screen.
const SHOW_AFTER_PX = 600;

export default function ScrollToTopButton() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setVisible(window.scrollY > SHOW_AFTER_PX);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (pathname?.startsWith("/console/matches/")) return null;

  const toTop = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      title="Back to top"
      style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
      className={`fixed right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-navy-700 bg-navy-900 text-white shadow-lg shadow-navy-950/30 transition-all duration-300 hover:bg-crimson-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson-500 focus-visible:ring-offset-2 ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  );
}
