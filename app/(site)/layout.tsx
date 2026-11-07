import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import SiteHeader from "../../components/SiteHeader";

/** Static shell shown while the interactive header streams in
 *  (SiteHeader uses usePathname, so it must sit inside a Suspense boundary). */
function HeaderFallback() {
  return (
    <header className="bg-navy-950 text-white sticky top-0 z-40 shadow-md" aria-hidden="true">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center h-14">
          <span className="font-display text-2xl font-bold tracking-wide whitespace-nowrap">
            PGLU<span className="text-crimson-400">LYMPICS</span>
          </span>
        </div>
      </div>
      <div className="h-1 bg-gradient-to-r from-crimson-800 via-crimson-600 to-navy-800" />
    </header>
  );
}

/** Chrome for the public site + console: header, content column, footer.
 *  Routes outside this group (e.g. /display) get none of it. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<HeaderFallback />}>
        <SiteHeader />
      </Suspense>
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-5">{children}</main>
      <footer className="bg-navy-950 text-navy-100 mt-8">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm flex flex-col sm:flex-row justify-between gap-2">
          <p><span className="font-display tracking-tight text-lg font-semibold text-white">PGLUlympics</span> — Provincial Government of La Union Sports Fest</p>
          <p>Live updates powered by sport coordinators on site. · <Link href="/display" target="_blank" rel="noreferrer" className="font-semibold text-white underline underline-offset-2 hover:text-crimson-400">TV Board ↗</Link></p>
        </div>
      </footer>
    </>
  );
}
