import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { DataRoot } from "../lib/data/context";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "PGLUlympics — PGLU Sports Fest 2026",
  description: "Live scores, schedules, standings and the overall medal tally for the Provincial Government of La Union sports fest, Nov 9–26, 2026.",
};

/** Root layout: document shell + fonts + the live data root ONLY.
 *  Site chrome (header / footer / content column) lives in
 *  app/(site)/layout.tsx so chromeless routes like /display (the TV
 *  board) render without it. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <DataRoot>{children}</DataRoot>
      </body>
    </html>
  );
}
