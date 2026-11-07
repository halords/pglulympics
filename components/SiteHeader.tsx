"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSnapshot } from "../lib/data/context";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="h-6 w-6">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="h-6 w-6">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

const deskLink = (active: boolean) =>
  `px-2.5 py-1.5 rounded transition-colors whitespace-nowrap ${active ? "bg-crimson-800 text-white font-semibold" : "hover:bg-navy-800"}`;

export default function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const snap = useSnapshot();
  const sports = snap?.sports ?? null; // null while the snapshot loads
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSportsOpen, setMobileSportsOpen] = useState(false);
  const [deskSportsOpen, setDeskSportsOpen] = useState(false);
  const deskRef = useRef<HTMLDivElement>(null);

  // Close everything on navigation (state adjusted during render,
  // the React-endorsed pattern for prop-derived resets).
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
    setDeskSportsOpen(false);
  }

  // Desktop dropdown: close on Escape / outside pointer.
  useEffect(() => {
    if (!deskSportsOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDeskSportsOpen(false); };
    const onPointer = (e: PointerEvent) => {
      if (deskRef.current && !deskRef.current.contains(e.target as Node)) setDeskSportsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [deskSportsOpen]);

  const sportsActive = pathname.startsWith("/sports");
  const sportLinks = (onNavigate?: () => void) =>
    sports === null
      ? <span className="block px-4 py-2.5 text-sm text-navy-100">Loading sports…</span>
      : sports.map((s) => (
          <Link
            key={s.id}
            href={`/sports/${s.slug}`}
            onClick={onNavigate}
            aria-current={pathname === `/sports/${s.slug}` ? "page" : undefined}
            className={`flex min-h-[44px] items-center px-4 py-2.5 text-[15px] transition-colors hover:bg-navy-800 ${pathname === `/sports/${s.slug}` ? "bg-crimson-800 font-semibold text-white" : ""}`}
          >
            {s.name}
          </Link>
        ));

  return (
    <header className="bg-navy-950 text-white sticky top-0 z-40 shadow-md">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center justify-between gap-2 h-14">
          <Link href="/" className="flex min-w-0 items-baseline gap-2" aria-label="PGLUlympics home">
            <span className="font-display text-2xl font-bold tracking-wide whitespace-nowrap">
              PGLU<span className="text-crimson-400">LYMPICS</span>
            </span>
            <span className="hidden sm:inline text-[11px] uppercase tracking-widest text-navy-100 whitespace-nowrap">Nov 9–26, 2026</span>
          </Link>

          {/* Desktop nav (md+) — full row, unchanged shape */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium" aria-label="Primary">
            <Link href="/" className={deskLink(isActive(pathname, "/"))} aria-current={isActive(pathname, "/") ? "page" : undefined}>Home</Link>
            <Link href="/tally" className={deskLink(isActive(pathname, "/tally"))} aria-current={isActive(pathname, "/tally") ? "page" : undefined}>Medal Tally</Link>
            <div className="relative" ref={deskRef}>
              <button
                type="button"
                onClick={() => setDeskSportsOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={deskSportsOpen}
                className={`${deskLink(sportsActive)} inline-flex items-center gap-1`}
              >
                Sports <Chevron open={deskSportsOpen} />
              </button>
              {deskSportsOpen && (
                <div className="absolute right-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-xl border border-navy-800 bg-navy-900 py-1.5 shadow-xl">
                  {sportLinks(() => setDeskSportsOpen(false))}
                </div>
              )}
            </div>
            <Link href="/schedule" className={deskLink(isActive(pathname, "/schedule"))} aria-current={isActive(pathname, "/schedule") ? "page" : undefined}>Schedule</Link>
            <Link href="/console" className={deskLink(isActive(pathname, "/console"))} aria-current={isActive(pathname, "/console") ? "page" : undefined}>Console</Link>
            <Link href="/display" className={deskLink(isActive(pathname, "/display"))} aria-current={isActive(pathname, "/display") ? "page" : undefined}>TV Board</Link>
          </nav>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="md:hidden inline-flex h-11 w-11 shrink-0 items-center justify-center rounded hover:bg-navy-800 transition-colors"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile slide-down panel */}
      {mobileOpen && (
        <nav id="mobile-nav" className="md:hidden border-t border-navy-800" aria-label="Mobile">
          <Link href="/" onClick={() => setMobileOpen(false)} aria-current={isActive(pathname, "/") ? "page" : undefined}
            className={`flex min-h-[44px] items-center px-4 py-2.5 font-medium ${isActive(pathname, "/") ? "bg-crimson-800 text-white" : ""}`}>Home</Link>
          <Link href="/tally" onClick={() => setMobileOpen(false)} aria-current={isActive(pathname, "/tally") ? "page" : undefined}
            className={`flex min-h-[44px] items-center px-4 py-2.5 font-medium ${isActive(pathname, "/tally") ? "bg-crimson-800 text-white" : ""}`}>Medal Tally</Link>
          <button
            type="button"
            onClick={() => setMobileSportsOpen((v) => !v)}
            aria-expanded={mobileSportsOpen}
            className={`flex min-h-[44px] w-full items-center justify-between px-4 py-2.5 font-medium text-left ${sportsActive ? "bg-crimson-800 text-white" : ""}`}
          >
            Sports <Chevron open={mobileSportsOpen} />
          </button>
          {mobileSportsOpen && (
            <div className="border-y border-navy-800 bg-navy-900/60 py-1">
              {sportLinks(() => setMobileOpen(false))}
            </div>
          )}
          <Link href="/schedule" onClick={() => setMobileOpen(false)} aria-current={isActive(pathname, "/schedule") ? "page" : undefined}
            className={`flex min-h-[44px] items-center px-4 py-2.5 font-medium ${isActive(pathname, "/schedule") ? "bg-crimson-800 text-white" : ""}`}>Schedule</Link>
          <Link href="/console" onClick={() => setMobileOpen(false)} aria-current={isActive(pathname, "/console") ? "page" : undefined}
            className={`flex min-h-[44px] items-center px-4 py-2.5 font-medium ${isActive(pathname, "/console") ? "bg-crimson-800 text-white" : ""}`}>Console</Link>
          <Link href="/display" onClick={() => setMobileOpen(false)} aria-current={isActive(pathname, "/display") ? "page" : undefined}
            className={`flex min-h-[44px] items-center px-4 py-2.5 font-medium ${isActive(pathname, "/display") ? "bg-crimson-800 text-white" : ""}`}>TV Board</Link>
        </nav>
      )}
      <div className="h-1 bg-gradient-to-r from-crimson-800 via-crimson-600 to-navy-800" />
    </header>
  );
}
