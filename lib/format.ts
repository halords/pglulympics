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
