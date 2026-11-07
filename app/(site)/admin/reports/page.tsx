"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSnapshot } from "../../../../lib/data/context";
import { useSession } from "../../../../lib/data/session";
import { buildTop3Report, PLACE_LABEL, type ReportPlace } from "../../../../lib/report";
import { downloadTop3Xlsx } from "../../../../lib/report-file";
import TallyTable from "../../../../components/TallyTable";

// Admin TOP-3 REPORT — every sport, every division, from CONFIRMED awards
// only (the same set the public medal tally counts; drafts never appear).
// Super-admin only, same gate as /admin. Three outputs: this screen, the
// print stylesheet (browser print / Save-as-PDF → clean A4, one sport per
// page), and the Excel export (lib/report-file.ts).

const DATE_FMT = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
});

const MEDAL_DOT: Record<ReportPlace["medal"], string> = {
  gold: "bg-gold-500",
  silver: "bg-silver-400",
  bronze: "bg-bronze-500",
};

export default function Top3ReportPage() {
  const snap = useSnapshot();
  const session = useSession();
  // Stamped on mount (client-only): Next prerendering rejects unstable
  // values like `new Date()` in a Client Component body — same effect
  // pattern as the /display clock.
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setGeneratedAt(new Date()), 0);
    return () => clearTimeout(t);
  }, []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const report = useMemo(() => (snap ? buildTop3Report(snap) : null), [snap]);

  if (!session.ready || !snap || !report) return <p className="text-neutral-500 py-10 text-center">Loading…</p>;
  if (session.role !== "admin") {
    return (
      <div className="max-w-md mx-auto text-center space-y-3 py-8">
        <h1 className="font-display tracking-tight text-3xl font-bold text-navy-950">SUPER ADMIN</h1>
        <p className="text-neutral-600">This area is for the super-admin account only.</p>
        <Link href="/login" className="inline-block rounded-xl bg-navy-950 text-white px-6 py-3 font-semibold">Go to sign-in</Link>
      </div>
    );
  }

  const exportXlsx = async () => {
    setBusy(true); setNotice(null);
    try {
      await downloadTop3Xlsx(report);
      setNotice("Excel report downloaded — sheets: Top 3 + Medal Tally.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Excel export failed."); }
    setBusy(false);
  };

  return (
    <div className="report-print-area space-y-6 max-w-4xl mx-auto">
      {/* screen-only toolbar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className="text-sm font-semibold text-navy-800 underline">← Super Admin</Link>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => void exportXlsx()}
            className="rounded-xl bg-navy-950 text-white px-5 py-3 font-bold text-sm min-h-[48px] disabled:opacity-60">
            Export Excel (.xlsx)
          </button>
          <button onClick={() => window.print()}
            className="rounded-xl bg-crimson-800 text-white px-5 py-3 font-bold text-sm min-h-[48px]">
            Print / Save as PDF
          </button>
        </div>
      </div>
      {notice && <p className="no-print rounded-lg bg-navy-50 border border-navy-100 px-3 py-2 text-sm">{notice}</p>}

      {/* report header — prints */}
      <header className="border-b-4 border-crimson-600 pb-3">
        <h1 className="font-display tracking-tight text-4xl font-bold text-navy-950 uppercase">{report.eventName} — Top 3 Report</h1>
        <p className="text-neutral-600 mt-1">
          Official winners per sport and division, from <strong>confirmed</strong> results only.
        </p>
        <p className="text-sm text-neutral-500 mt-1 tabular-nums">
          {generatedAt
            ? <>Generated {DATE_FMT.format(generatedAt)} · {TIME_FMT.format(generatedAt)} (Asia/Manila) · </>
            : <>Generated — · </>}
          <strong className="text-navy-950">{report.decidedCount} of {report.totalDivisions} divisions decided</strong>
        </p>
      </header>

      {/* overall medal tally summary */}
      <section className="report-section">
        <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950 mb-2">OVERALL MEDAL TALLY</h2>
        <TallyTable rows={report.tally} />
        <p className="text-sm text-neutral-500 mt-2 tabular-nums">
          Points: <strong>{snap.event.goldPoints}</strong> per gold · <strong>{snap.event.silverPoints}</strong> per silver · <strong>{snap.event.bronzePoints}</strong> per bronze
          {snap.event.pointsProvisional && <span className="ml-2 rounded bg-crimson-100 border border-crimson-600 text-crimson-800 px-1.5 py-0.5 text-xs font-semibold">PROVISIONAL — awaiting organizer confirmation</span>}
        </p>
      </section>

      {/* per sport → per division top 3 */}
      {report.sports.map((sp) => (
        <section key={sp.sportId} className="report-sport">
          <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950 uppercase border-b-2 border-navy-950 pb-1 mb-3">{sp.sportName}</h2>
          <div className="space-y-4">
            {sp.divisions.filter((d) => d.decided).map((d) => (
              <div key={d.divisionId} className="report-division rounded-xl border border-navy-100 bg-white p-4">
                <h3 className="font-display tracking-tight text-xl font-bold">{d.divisionName}</h3>
                <ul className="mt-2 space-y-1.5">
                  {d.places.map((p) => (
                    <li key={p.place} className="flex items-start gap-2.5">
                      <span className={`mt-1.5 block h-3.5 w-3.5 shrink-0 rounded-full ${MEDAL_DOT[p.medal]}`} aria-hidden="true" />
                      <span className="w-10 shrink-0 font-display tracking-tight text-lg font-bold tabular-nums">{PLACE_LABEL[p.place]}</span>
                      <span className="min-w-0">
                        {p.teams.map((t) => (
                          <span key={t.entryId} className="block">
                            <span className="font-semibold text-navy-950">{t.teamName}</span>
                            {t.players.length > 0 && (
                              <span className="block text-sm text-neutral-600">{t.players.join(", ")}</span>
                            )}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {sp.divisions.every((d) => !d.decided) && (
              <p className="text-sm text-neutral-500">No divisions decided yet in this sport.</p>
            )}
          </div>
        </section>
      ))}

      {/* coverage: not yet decided */}
      <section className="report-section rounded-xl border border-navy-100 bg-white p-4">
        <h2 className="font-display tracking-tight text-2xl font-bold text-navy-950 mb-2">
          NOT YET DECIDED ({report.pending.length})
        </h2>
        {report.pending.length === 0 ? (
          <p className="text-sm text-neutral-600">Every division has a confirmed Top 3. 🎉</p>
        ) : (
          <ul className="text-sm space-y-1 sm:columns-2">
            {report.pending.map((p) => (
              <li key={`${p.sportName}|${p.divisionName}`} className="break-inside-avoid">
                <span className="font-semibold">{p.sportName}</span> — {p.divisionName}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
