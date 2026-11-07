// Asia/Manila display formatting (event timezone is fixed).
const TZ = "Asia/Manila";

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "TBA";
  return new Intl.DateTimeFormat("en-PH", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "TBA";
  return new Intl.DateTimeFormat("en-PH", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));
}
export function fmtDayLong(iso: string | null | undefined): string {
  if (!iso) return "TBA";
  return new Intl.DateTimeFormat("en-PH", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(iso));
}
export function manilaDayKey(iso: string | null | undefined): string {
  if (!iso) return "tba";
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
export function isTodayManila(iso: string | null | undefined): boolean {
  return !!iso && manilaDayKey(iso) === manilaDayKey(new Date().toISOString());
}

/** Join a label path ("Sport · Division · Label") dropping empty parts and
 *  exact duplicates (case-insensitive) — e.g. "Laro ng Lahi · Patintero ·
 *  Patintero" becomes "Laro ng Lahi · Patintero". */
export function dedupeLabel(parts: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = (p ?? "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.join(" · ");
}
