import type { Metadata } from "next";
import { Suspense } from "react";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { DataRoot } from "../lib/data/context";
import SiteHeader from "../components/SiteHeader";

/** Static shell shown while the interactive header streams in
 *  (SiteHeader uses usePathname, so it must sit inside a Suspense boundary). */
function HeaderFallback() {
  return (
    <header className="bg-navy-950 text-white sticky top-0 z-40 shadow-md" aria-hidden="true">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center h-14">
          <span className="font-display text-2xl font-bold tracking-wide whitespace-nowrap">
            PGLU<span className="text-gold-500">LYMPICS</span>
          </span>
        </div>
      </div>
      <div className="h-1 bg-gradient-to-r from-crimson-800 via-gold-500 to-navy-800" />
    </header>
  );
}

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "PGLUlympics — PGLU Sports Fest 2026",
  description: "Live scores, schedules, standings and the overall medal tally for the Provincial Government of La Union sports fest, Nov 9–26, 2026.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <DataRoot>
          <Suspense fallback={<HeaderFallback />}>
            <SiteHeader />
          </Suspense>
          <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-5">{children}</main>
        </DataRoot>
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
