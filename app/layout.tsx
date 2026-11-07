import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { DataRoot } from "../lib/data/context";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "PGLUlympics — PGLU Sports Fest 2026",
  description: "Live scores, schedules, standings and the overall medal tally for the Provincial Government of La Union sports fest, Nov 9–26, 2026.",
};

const NAV = [
  { href: "/", label: "Home" },
  { href: "/tally", label: "Medal Tally" },
  { href: "/sports/volleyball", label: "Volleyball" },
  { href: "/schedule", label: "Schedule" },
  { href: "/console", label: "Console" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="bg-navy-950 text-white sticky top-0 z-40 shadow-md">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex items-center justify-between h-14">
              <Link href="/" className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold tracking-wide">
                  PGLU<span className="text-gold-500">LYMPICS</span>
                </span>
                <span className="hidden sm:inline text-[11px] uppercase tracking-widest text-navy-100">Nov 9–26, 2026</span>
              </Link>
              <nav className="flex items-center gap-1 text-sm font-medium">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="px-2.5 py-1.5 rounded hover:bg-navy-800 transition-colors">
                    {n.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
          <div className="h-1 bg-gradient-to-r from-crimson-800 via-gold-500 to-navy-800" />
        </header>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-5">
          <DataRoot>{children}</DataRoot>
        </main>
        <footer className="bg-navy-950 text-navy-100 mt-8">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm flex flex-col sm:flex-row justify-between gap-2">
            <p><span className="font-display text-lg text-white">PGLUlympics</span> — Provincial Government of La Union Sports Fest</p>
            <p>Live updates powered by sport coordinators on site.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
