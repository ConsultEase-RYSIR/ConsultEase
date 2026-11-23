import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDay } from "@/lib/format";
import { formatSize, type Check } from "@/lib/documentsRules";
import { DropZone, UploadButton } from "./DocActions";

export const dynamic = "force-dynamic";
type Doc = { id: string; requirement: string; required: boolean; status: string; fileName: string | null; fileSize: number | null; storageKey: string | null; precheck: unknown; professorComment: string | null; submittedAt: Date | null };

const checksOf = (d: Doc) => (Array.isArray(d.precheck) ? (d.precheck as Check[]) : []);
function badge(d: Doc): [string, string] {
  const warn = checksOf(d).filter((c) => !c.ok).length;
  switch (d.status) {
    case "MISSING": return d.required ? ["Missing", "bg-red-50 text-red-700"] : ["Not submitted", "bg-gray-100 text-slate-600"];
    case "NEEDS_FIX": return ["Needs fix", "bg-amber-50 text-amber-800"];
    case "UNDER_REVIEW": return ["Awaiting professor review", "bg-tint text-brand"];
    case "REVIEWED": return ["Reviewed", "bg-green-100 text-green-800"];
    default: return warn ? [`Pre-check: ${warn} warning${warn > 1 ? "s" : ""}`, "bg-amber-50 text-amber-800"] : ["Pre-check passed", "bg-green-100 text-green-800"];
  }
}
const filled = (d: Doc) => !!d.storageKey && d.status !== "MISSING";

export default async function DocumentsPage({ searchParams }: { searchParams: { appt?: string; doc?: string } }) {
  const uid = ((await getServerSession(authOptions))?.user as any).id as string;
  const list = await prisma.appointment.findMany({
    where: { studentId: uid, status: { in: ["PENDING", "APPROVED", "CHECKED_IN", "IN_CONSULTATION"] }, endsAt: { gte: new Date() } },
    include: { professor: true, documents: { orderBy: [{ required: "desc" }, { id: "asc" }] } }, orderBy: { startsAt: "asc" },
  });
  if (!list.length)
    return (
      <div><h1 className="text-3xl font-bold">Documents</h1><p className="mt-1 text-muted">Upload what your professor needs before the consultation. We run a quick pre-check on every file.</p>
        <div className="card mt-6 max-w-xl"><h2 className="text-lg font-bold">Nothing to upload yet</h2><p className="mt-1 text-sm text-muted">When you request a consultation, the documents your professor needs appear here.</p><Link href="/student/request" className="btn mt-4">Request consultation</Link></div></div>);

  const sel = list.find((a) => a.id === searchParams.appt) ?? list.find((a) => a.documents.some((d) => d.required && d.status === "MISSING")) ?? list[0];
  const docs = sel.documents as Doc[], done = docs.filter(filled).length;
  const open = docs.filter((d) => d.status === "MISSING" || d.status === "NEEDS_FIX").map((d) => d.id);
  const shown = docs.find((d) => d.id === searchParams.doc && filled(d)) ?? [...docs].filter(filled).sort((a, b) => +(b.submittedAt ?? 0) - +(a.submittedAt ?? 0))[0];
  const all = list.flatMap((a) => a.documents as Doc[]);
  const count = (s: string) => all.filter((d) => d.status === s && (s !== "MISSING" || d.required)).length;
  const counts: [string, number][] = [["Submitted", count("SUBMITTED")], ["Under review", count("UNDER_REVIEW")], ["Needs fix", count("NEEDS_FIX")], ["Missing", count("MISSING")], ["Reviewed", count("REVIEWED")]];
  const others = list.filter((a) => a.id !== sel.id).flatMap((a) => a.documents.filter((d) => d.status !== "MISSING" || d.required).map((d) => ({ a, d: d as Doc })));
  const checks = shown ? checksOf(shown) : [];

  return (
    <div>
      <h1 className="text-3xl font-bold">Documents</h1>
      <p className="mt-1 text-muted">Upload what your professor needs before the consultation. We run a quick pre-check on every file.</p>

      {list.length > 1 && (
        <nav aria-label="Consultations" className="mt-5 flex flex-wrap gap-2">
          {list.map((a) => <Link key={a.id} href={`/student/documents?appt=${a.id}`} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${a.id === sel.id ? "border-brand bg-tint text-brand" : "border-gray-300 bg-white"}`}>{a.title} · {fmtDay(a.startsAt)}</Link>)}
        </nav>)}

      <div className="mt-6 grid grid-cols-[1fr_340px] gap-6">
        <div>
          <section className="card !p-6">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm text-muted">For consultation</p><h2 className="text-xl font-bold">{sel.title} · {fmtDay(sel.startsAt)}</h2><p className="text-sm text-muted">with {sel.professor.name}</p></div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${done === docs.length && docs.length ? "bg-green-100 text-green-800" : "bg-amber-50 text-amber-800"}`}>{done} of {docs.length} submitted</span>
            </div>
            {docs.length ? (
              <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
                {docs.map((d, i) => {
                  const [label, cls] = badge(d), has = filled(d);
                  return (
                    <li key={d.id} className="flex items-center gap-4 p-4">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold ${has ? "bg-green-100 text-green-800" : "bg-gray-100 text-slate-600"}`}>{has ? "✓" : i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <b className="block">{d.requirement}</b>
                        <p className="truncate text-sm text-muted">{d.required ? "Required" : "Optional"} · {has ? <>{d.storageKey?.endsWith(".pdf") ? "PDF" : "DOCX"} · <Link href={`/student/documents?appt=${sel.id}&doc=${d.id}`} className="underline">{d.fileName}</Link> · {formatSize(d.fileSize ?? 0)}</> : "PDF or DOCX"}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{label}</span>
                      {d.status !== "REVIEWED" && <UploadButton id={d.id} label={has ? "Replace" : "Upload"} />}
                    </li>);
                })}
              </ul>) : <p className="mt-4 rounded-xl bg-canvas p-4 text-sm text-slate-600">{sel.professor.name} didn't ask for documents for this consultation.</p>}
          </section>

          <DropZone openIds={open} />

          {others.length > 0 && (
            <section className="card mt-5 !p-6"><h2 className="text-xl font-bold">Other submissions</h2>
              <ul className="mt-2 divide-y divide-line">{others.map(({ a, d }) => { const [label, cls] = badge(d); return (
                <li key={d.id}><Link href={`/student/documents?appt=${a.id}`} className="flex items-center justify-between gap-3 py-3">
                  <span><b className="block">{d.fileName ?? d.requirement}</b><span className="text-sm text-muted">For {a.professor.name} · {fmtDay(a.startsAt).replace(/^\w+, /, "")}</span></span>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{label}</span></Link></li>); })}</ul></section>)}
        </div>

        <aside className="space-y-5 self-start">
          <section className="card"><h2 className="mb-3 text-lg font-bold">{shown ? <>Pre-check · {shown.fileName}</> : "Pre-check"}</h2>
            {shown ? (
              <>
                {shown.status === "NEEDS_FIX" && shown.professorComment && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><b>From your professor:</b> {shown.professorComment}</p>}
                <ul className="space-y-2 text-sm">{checks.map((c, i) => <li key={i} className="flex gap-2"><span aria-hidden className={`font-bold ${c.ok ? "text-green-700" : "text-amber-600"}`}>{c.ok ? "✓" : "!"}</span><span><span className="sr-only">{c.ok ? "Passed: " : "Warning: "}</span>{c.label}</span></li>)}</ul>
                <p className="mt-3 text-xs text-muted">The pre-check is basic. Your professor reviews the content.</p>
                <a href={`/api/documents/${shown.id}/file`} className="mt-3 inline-block text-sm font-semibold text-brand underline">Download file</a>
              </>
            ) : <p className="text-sm text-slate-600">Upload a file and we'll check it right away.</p>}
          </section>
          <section className="card"><h2 className="mb-3 text-lg font-bold">Submission status</h2>
            <dl className="space-y-1.5 text-sm">{counts.filter(([k, n]) => k !== "Reviewed" || n > 0).map(([k, n]) => <div key={k} className="flex justify-between"><dt className="text-slate-600">{k}</dt><dd className="font-bold">{n}</dd></div>)}</dl></section>
        </aside>
      </div>
    </div>
  );
}
