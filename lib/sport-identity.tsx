// Per-sport identity (console + scoreboard + TV board): a clean line-style
// icon (inline SVG, stroke-based, NO emoji) and an accent tint per sport.
// Navy/crimson stay the brand base — tints are ACCENTS ONLY (header bands,
// chips, bug accents, icon color). Tints are deep jewel/clay tones picked to
// sit on navy-950 and white without fighting crimson; bright orange (the
// obvious basketball choice) is deliberately avoided as off-palette.
import type { ReactElement } from "react";

export interface SportIdentity {
  slug: string;
  /** Accent tint (hex). Used via inline styles so any value is safe. */
  tint: string;
  /** Human label for the tint (documentation / STATE.md). */
  tintName: string;
}

const FALLBACK: SportIdentity = { slug: "", tint: "#0b3d91", tintName: "navy" };

export const SPORT_IDENTITIES: Record<string, SportIdentity> = {
  basketball: { slug: "basketball", tint: "#6d28d9", tintName: "violet" },
  volleyball: { slug: "volleyball", tint: "#0f766e", tintName: "teal" },
  badminton: { slug: "badminton", tint: "#0369a1", tintName: "sky" },
  pickleball: { slug: "pickleball", tint: "#4d7c0f", tintName: "lime" },
  bowling: { slug: "bowling", tint: "#4338ca", tintName: "indigo" },
  athletics: { slug: "athletics", tint: "#92400e", tintName: "clay" },
  chess: { slug: "chess", tint: "#334155", tintName: "slate" },
  "mobile-games": { slug: "mobile-games", tint: "#a21caf", tintName: "fuchsia" },
  "laro-ng-lahi": { slug: "laro-ng-lahi", tint: "#be123c", tintName: "rose" },
};

/** Resolve identity by sport slug (snapshot sports carry slug + iconKey;
 *  iconKey mirrors the slug in both providers, so either works). */
export function sportIdentity(
  sport: { slug?: string | null; iconKey?: string | null } | string | null | undefined,
): SportIdentity {
  const key = typeof sport === "string" ? sport : (sport?.slug ?? sport?.iconKey ?? "");
  return SPORT_IDENTITIES[key] ?? { ...FALLBACK, slug: key };
}

/** Soft tint background (tint at ~10% alpha) for chips/bands on light surfaces. */
export function tintSoft(tint: string): string {
  return `${tint}1a`;
}

const P = {
  basketball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3v18" />
      <path d="M5.2 5.2c2.8 3.4 2.8 10.2 0 13.6" />
      <path d="M18.8 5.2c-2.8 3.4-2.8 10.2 0 13.6" />
    </>
  ),
  volleyball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3c2.2 3.6 2 7.4-.5 10.5" />
      <path d="M20.6 9.2c-4 .8-7.7-.3-10.6-3" />
      <path d="M7.6 20.4c.9-4 3.6-6.9 7.4-8.2" />
      <path d="M3.6 10.5c2.8.4 5.2 1.7 6.9 3.8" />
    </>
  ),
  badminton: (
    <>
      <path d="M9.2 14.8 5.6 4.2" />
      <path d="M11 14.6 9.8 3.6" />
      <path d="M12.9 14.6 13.4 3.6" />
      <path d="M14.8 14.8 18.4 4.2" />
      <path d="M5.6 4.2c4.2-1.4 8.6-1.4 12.8 0" />
      <path d="M9 15.2h6l-.7 3.1a2.6 2.6 0 0 1-4.6 0L9 15.2Z" />
    </>
  ),
  pickleball: (
    <>
      <rect x="8" y="2.6" width="9.5" height="12" rx="4.2" />
      <path d="M11.2 14.6v4.6a1.6 1.6 0 0 0 3.1 0v-4.6" />
      <circle cx="5" cy="18.4" r="2.5" />
      <path d="M4.2 17.2h.01M5.8 17.2h.01M5 18.9h.01" strokeWidth="2.2" />
    </>
  ),
  bowling: (
    <>
      <path d="M9.6 2.8c1.7.9 2.3 2.8 1.6 4.6-.4 1.1-.3 2.2.2 3.4.6 1.5 1.7 3 1.7 5.2H6c0-2.2 1.1-3.7 1.7-5.2.5-1.2.6-2.3.2-3.4-.7-1.8 0-3.7 1.7-4.6Z" />
      <path d="M7.9 7.2c1.1.5 2.3.5 3.4 0" />
      <circle cx="17.6" cy="17.4" r="3.8" />
      <path d="M16.4 16.2h.01M18.6 15.8h.01M17.4 18h.01" strokeWidth="2.2" />
    </>
  ),
  athletics: (
    <>
      <circle cx="15.2" cy="4.3" r="1.9" />
      <path d="M13.4 7.6 9.8 10.8l-3.4-1" />
      <path d="M9.8 10.8l-1.2 4L5 17.6" />
      <path d="M9.8 10.8l3.6 1.8 1.2 4.6" />
      <path d="M13.4 7.6l3 1.4 2.8-.6" />
      <path d="M3 20.8h18" strokeDasharray="2.5 3" />
    </>
  ),
  chess: (
    <>
      <path d="M5.5 3.2v3.6h13V3.2h-3.4v2.4h-2.7V3.2H9.6v2.4H6.9V3.2H5.5Z" />
      <path d="M7.6 6.8c.1 3.6-.6 5.9-1.8 8.7h11.4c-1.2-2.8-1.9-5.1-1.8-8.7" />
      <path d="M4.8 20.8h14.4M6.1 15.5h11.8v5.3H6.1z" />
    </>
  ),
  "mobile-games": (
    <>
      <rect x="2.6" y="8" width="18.8" height="9.2" rx="4.6" />
      <path d="M8.2 10.4v4.4M6 12.6h4.4" />
      <path d="M16.3 11.4h.01M18.4 14h.01" strokeWidth="2.4" />
    </>
  ),
  "laro-ng-lahi": (
    <>
      <path d="M12 2.6 19 10l-7 5.8L5 10l7-7.4Z" />
      <path d="M5 10h14" />
      <path d="M12 2.6v13.2" />
      <path d="M12 15.8c-1.6 1.7 1.6 2.6 0 4.4" />
    </>
  ),
  fallback: (
    <>
      <path d="M7 3.8h10V9a5 5 0 0 1-10 0V3.8Z" />
      <path d="M7 5.4H4.4a2.8 2.8 0 0 0 2.8 4.4M17 5.4h2.6a2.8 2.8 0 0 1-2.8 4.4" />
      <path d="M12 14v3.2M8.4 20.8h7.2M9.6 17.2h4.8v3.6H9.6z" />
    </>
  ),
} satisfies Record<string, ReactElement>;

/** Line-style sport icon. Color comes from `color`/currentColor — tint it
 *  with the sport identity at the call site. */
export function SportIcon({
  sport,
  className = "h-5 w-5",
}: {
  sport: { slug?: string | null; iconKey?: string | null } | string | null | undefined;
  className?: string;
}) {
  const key = typeof sport === "string" ? sport : (sport?.slug ?? sport?.iconKey ?? "");
  const body = (P as Record<string, ReactElement>)[key] ?? P.fallback;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {body}
    </svg>
  );
}
