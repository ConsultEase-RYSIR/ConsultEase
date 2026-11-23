import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtRange, PRIORITY } from "@/lib/format";
import { CONCERN_OF, FILTERS, fmtLong, revisionText } from "@/lib/history";
import { RatingForm, RevisionCheck } from "./HistoryActions";

export const dynamic = "force-dynamic";
const LIVE = ["PENDING", "APPROVED", "CHECKED_IN", "IN_CONSULTATION", "COMPLETED"];

export default async function HistoryPage({ searchParams }: { searchParams: { appt?: string; filter?: string } }) {
  const uid = ((await getServerSession(authOptions))?.user as any).id as string;
  const filter = FILTERS.some(([k]) => k === searchParams.filter) ? searchParams.filter! : "all";
  const [past, later] = await Promise.all([
    prisma.appointment.findMany({
      where: { studentId: uid, status: { in: ["COMPLETED", "NO_SHOW"] }, ...(CONCERN_OF[filter] ? { concern: CONCERN_OF[filter] as any } : {}) },
      orderBy: { startsAt: "desc" },
      include: { professor: { include: { settings: true } }, evaluation: true,
        // private notes are never selected here
        record: { select: { status: true, concerns: true, feedback: true, revisions: { orderBy: { dueDate: "asc" } } } } },
    }),
    prisma.appointment.findMany({ where: { studentId: uid, status: { in: LIVE as any } }, select: { professorId: true, startsAt: true } }),
  ]);
  const view = past.map((a) => ({ a, rec: a.record?.status === "SENT" ? a.record : null, rebooked: a.status === "NO_SHOW" && later.some((l) => l.professorId === a.professorId && l.startsAt > a.startsAt) }));
  const sel = view.find((v) => v.a.id === searchParams.appt) ?? view[0];
  const now = new Date();

  return (
    <div>
      <h1 className="text-3xl font-bold">History & feedback</h1>
      <p className="mt-1 text-muted">Past consultations, your professors' feedback and the revisions they asked for.</p>

      <div className="mt-6 grid grid-cols-[380px_1fr] items-start gap-6">
        <div>
          <nav aria-label="Filter by concern" className="flex flex-wrap gap-2">
            {FILTERS.map(([k, label]) => <Link key={k} href={`/student/history?filter=${k}`} aria-current={k === filter ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-semibold ${k === filter ? "border-brand bg-tint text-brand" : "border-gray-300 bg-white"}`}>{label}</Link>)}
          </nav>
          <ul className="mt-4 space-y-3">
            {view.map(({ a, rec, rebooked }) => (
              <li key={a.id}>
                <Link href={`/student/history?filter=${filter}&appt=${a.id}`} className={`block rounded-2xl bg-white p-4 ${a.id === sel?.a.id ? "border-2 border-brand" : "border border-line"}`}>
                  <span className="flex justify-between gap-3 text-sm"><span className="text-muted">{fmtLong(a.startsAt)}</span>
                    {a.status === "NO_SHOW" ? <span className="font-semibold text-red-700">No-show{rebooked && " · rescheduled"}</span> : <span className="text-muted">Completed</span>}</span>
                  <b className="mt-1 block text-lg">{a.title}</b>
                  <span className="text-sm text-muted">{a.professor.name} · {a.status === "NO_SHOW" ? "cancelled after grace period" : revisionText(rec?.revisions.length ?? 0, !!rec)}</span>
                </Link>
              </li>))}
            {!view.length && <li className="rounded-2xl border border-dashed border-gray-300 bg-white p-5 text-sm text-slate-600">{filter === "all" ? "No past consultations yet. Completed consultations, feedback and revisions appear here." : "No past consultations in this category."}</li>}
          </ul>
        </div>

        {sel && (
          <div className="space-y-5">
            <section className="card !p-6">
              <p className="text-sm text-muted">{fmtLong(sel.a.startsAt)} · {fmtRange(sel.a.startsAt, sel.a.endsAt)} · {sel.a.mode === "ONLINE" ? "Online" : "Face-to-face"}</p>
              <h2 className="mt-1 text-2xl font-bold">{sel.a.title} with {sel.a.professor.name}</h2>
              <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${PRIORITY[sel.a.priority].cls}`}><i className={`mr-1.5 inline-block h-2 w-2 rounded-full ${PRIORITY[sel.a.priority].dot}`} />{PRIORITY[sel.a.priority].label}</span>

              {sel.a.status === "NO_SHOW" ? (
                <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
                  <p>You didn't check in within {sel.a.professor.settings?.graceMin ?? 5} minutes of the start, so this slot was cancelled.{sel.rebooked ? " You've already booked another time." : " Request a new appointment to continue."}</p>
                  {!sel.rebooked && <Link href="/student/request" className="btn mt-3">Request consultation</Link>}
                </div>
              ) : sel.rec ? (
                <>
                  {sel.rec.concerns && <><h3 className="mt-6 font-bold">Consultation summary</h3><p className="mt-1 whitespace-pre-line text-slate-700">{sel.rec.concerns}</p></>}
                  {sel.rec.feedback && <><h3 className="mt-5 font-bold">Academic feedback</h3><p className="mt-1 whitespace-pre-line text-slate-700">{sel.rec.feedback}</p></>}
                  <h3 className="mt-5 font-bold">Required revisions</h3>
                  {sel.rec.revisions.length ? (
                    <ul className="mt-2 space-y-2">{sel.rec.revisions.map((r) => (
                      <RevisionCheck key={r.id} id={r.id} text={r.text} done={!!r.completedAt} due={r.dueDate ? r.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Manila" }) : ""} overdue={!!r.dueDate && r.dueDate < now} />))}</ul>
                  ) : <p className="mt-1 text-slate-700">No revisions required.</p>}
                </>
              ) : <p className="mt-5 rounded-xl bg-canvas p-4 text-sm text-slate-700">{sel.a.professor.name} hasn't sent the summary yet. You'll get a notification when it's ready.</p>}
            </section>

            {sel.a.status === "COMPLETED" && (
              <section className="card !p-6"><h2 className="text-xl font-bold">Rate this consultation</h2>
                <RatingForm key={sel.a.id} apptId={sel.a.id} rating={sel.a.evaluation?.rating ?? 0} comment={sel.a.evaluation?.comment ?? ""} /></section>)}
          </div>)}
      </div>
    </div>
  );
}
