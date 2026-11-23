import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDay } from "@/lib/format";
import { cap, fmtOpens } from "@/lib/queueRules";
import { formatSize, type Check } from "@/lib/documentsRules";
import { checklist, pagesFromChecks } from "@/lib/documentReview";
import { RemindButton, ReviewPanel } from "./ReviewPanel";

export const dynamic = "force-dynamic";
const OPEN = ["PENDING", "APPROVED", "CHECKED_IN", "IN_CONSULTATION"];
const TABS = [["review", "To review"], ["reviewed", "Reviewed"], ["missing", "Missing"]] as const;
const checksOf = (p: unknown) => (Array.isArray(p) ? (p as Check[]) : []);
const shortDay = (d: Date) => fmtDay(d).replace(/^\w+, /, "");

export default async function DocumentReview({ searchParams }: { searchParams: { tab?: string; doc?: string } }) {
  const uid = ((await getServerSession(authOptions))?.user as any).id as string;
  const now = new Date();
  const rows = await prisma.document.findMany({
    where: { appointment: { professorId: uid, status: { notIn: ["DECLINED", "CANCELLED", "NO_SHOW", "RESCHEDULED"] }, startsAt: { gte: new Date(now.getTime() - 14 * 864e5) } } },
    include: { appointment: { include: { student: true, documents: true } } }, orderBy: { id: "asc" },
  });
  const byTab = {
    review: rows.filter((d) => d.storageKey && ["SUBMITTED", "UNDER_REVIEW"].includes(d.status)).sort((a, b) => +a.appointment.startsAt - +b.appointment.startsAt || +(a.submittedAt ?? 0) - +(b.submittedAt ?? 0)),
    reviewed: rows.filter((d) => d.storageKey && ["REVIEWED", "NEEDS_FIX"].includes(d.status)).sort((a, b) => +(b.submittedAt ?? 0) - +(a.submittedAt ?? 0)),
    missing: rows.filter((d) => d.required && d.status === "MISSING" && OPEN.includes(d.appointment.status) && d.appointment.endsAt >= now).sort((a, b) => +a.appointment.startsAt - +b.appointment.startsAt),
  };
  const tab = (TABS.find(([k]) => k === searchParams.tab)?.[0] ?? "review") as keyof typeof byTab;
  const list = byTab[tab], sel = list.find((d) => d.id === searchParams.doc) ?? list[0];

  // Opening a file moves it from Submitted to Under review, so the student can see it's being looked at.
  if (sel?.status === "SUBMITTED") { await prisma.document.updateMany({ where: { id: sel.id, status: "SUBMITTED" }, data: { status: "UNDER_REVIEW" } }); sel.status = "UNDER_REVIEW"; }

  const reminded = new Set((await prisma.notification.findMany({
    where: { text: { startsWith: "Reminder:" }, createdAt: { gte: new Date(now.getTime() - 12 * 3600e3) }, href: { in: byTab.missing.map((d) => `/student/documents?appt=${d.appointmentId}&doc=${d.id}`) } }, select: { href: true },
  })).map((n) => n.href));
  const sent = (d: { id: string; appointmentId: string }) => reminded.has(`/student/documents?appt=${d.appointmentId}&doc=${d.id}`);

  const badge = (d: (typeof rows)[number]): [string, string] => {
    if (d.status === "MISSING") return [sent(d) ? "Missing · reminder sent" : "Missing", "bg-red-50 text-red-700"];
    if (d.status === "NEEDS_FIX") return ["Revision requested", "bg-amber-50 text-amber-800"];
    if (d.status === "REVIEWED") return ["Reviewed", "bg-green-100 text-green-800"];
    const w = checksOf(d.precheck).filter((c) => !c.ok).length;
    return w ? [`Pre-check: ${w} warning${w > 1 ? "s" : ""}`, "bg-amber-50 text-amber-800"] : ["Pre-check passed", "bg-green-100 text-green-800"];
  };

  const a = sel?.appointment, checks = sel ? checksOf(sel.precheck) : [], pages = pagesFromChecks(checks), pdf = !!sel?.storageKey?.endsWith(".pdf");
  const empty = { review: "Nothing to review right now. New uploads from your students appear here.", reviewed: "Files you review appear here.", missing: "No required files are missing for upcoming consultations." }[tab];

  return (
    <div>
      <h1 className="text-3xl font-bold">Document review</h1>
      <p className="mt-1 text-muted">Files students submitted before their consultations, with the automatic pre-check results.</p>

      <div className="mt-6 grid grid-cols-[380px_1fr] items-start gap-6">
        <div>
          <nav aria-label="Document groups" className="flex gap-2">
            {TABS.map(([k, label]) => (
              <Link key={k} href={`/professor/documents?tab=${k}`} aria-current={k === tab ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-semibold ${k === tab ? "border-brand bg-tint text-brand" : "border-gray-300 bg-white"}`}>
                {label}{k === "review" && ` · ${byTab.review.length}`}</Link>))}
          </nav>
          <ul className="mt-4 space-y-3">
            {list.map((d) => {
              const [label, cls] = badge(d), miss = d.status === "MISSING";
              return (
                <li key={d.id}>
                  <Link href={`/professor/documents?tab=${tab}&doc=${d.id}`} className={`block rounded-2xl bg-white p-4 ${d.id === sel?.id ? "border-2 border-brand" : miss ? "border border-dashed border-gray-300" : "border border-line"}`}>
                    <span className="flex justify-between gap-3 text-sm text-muted"><span>{d.appointment.student.name} · {cap(d.appointment.concern)}</span><span className="shrink-0">For {shortDay(d.appointment.startsAt)}</span></span>
                    <b className="mt-1 block break-words text-lg">{miss ? "No file yet" : d.fileName}</b>
                    <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{label}</span>
                  </Link>
                </li>);
            })}
            {!list.length && <li className="rounded-2xl border border-dashed border-gray-300 bg-white p-5 text-sm text-slate-600">{empty}</li>}
          </ul>
        </div>

        {sel && a ? (
          <section className="card !p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-sm text-muted">{a.student.name} · {cap(a.concern)}{sel.submittedAt && ` · Submitted ${fmtOpens(sel.submittedAt)}`}</p>
                <h2 className="break-words text-2xl font-bold">{sel.status === "MISSING" ? sel.requirement : sel.fileName}</h2>
                <p className="text-sm text-muted">{a.title} · {fmtDay(a.startsAt)}{sel.status !== "MISSING" && sel.fileSize ? ` · ${formatSize(sel.fileSize)}` : ""}</p></div>
              {sel.storageKey && <a href={`/api/documents/${sel.id}/file`} className="btn-ghost shrink-0">Download</a>}
            </div>

            {sel.status === "MISSING" ? (
              <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-canvas p-6">
                <b>No file yet</b>
                <p className="mt-1 text-sm text-slate-600">{a.student.name} hasn't uploaded the {sel.requirement}, which is required for this consultation.{sent(sel) ? " You've already sent a reminder." : " A reminder shows up in their notifications."}</p>
                <div className="mt-4"><RemindButton id={sel.id} sent={sent(sel)} /></div>
              </div>
            ) : (
              <>
                <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-canvas">
                  {pdf ? <iframe title={`Preview of ${sel.fileName}`} src={`/api/documents/${sel.id}/file?inline=1`} className="h-[440px] w-full bg-white" />
                    : <div className="grid h-[240px] place-items-center p-6 text-center"><div><b>Document preview</b><p className="mt-1 text-sm text-slate-600">Previews are available for PDF files. Download this Word file to read it.</p></div></div>}
                  <p className="border-t border-line bg-white px-4 py-2 text-center text-xs text-muted">{pdf ? `PDF preview${pages ? ` · ${pages} page${pages === 1 ? "" : "s"}` : ""}` : "Word document"}</p>
                </div>

                <h3 className="mt-6 font-bold">Pre-check results</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {[checklist(a.documents), ...checks].map((c, i) => <li key={i} className="flex gap-2"><span aria-hidden className={`font-bold ${c.ok ? "text-green-700" : "text-amber-600"}`}>{c.ok ? "✓" : "!"}</span><span><span className="sr-only">{c.ok ? "Passed: " : "Warning: "}</span>{c.label}</span></li>)}
                </ul>

                <div className="mt-6"><ReviewPanel key={sel.id} id={sel.id} status={sel.status} initial={sel.professorComment ?? ""} tab={tab} /></div>
              </>)}
          </section>) : <section className="card text-sm text-slate-600">Select a file to review it.</section>}
      </div>
    </div>
  );
}
