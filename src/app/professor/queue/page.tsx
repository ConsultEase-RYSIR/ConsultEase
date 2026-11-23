import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { estimateWait, fmtDay, fmtTime, PRIORITY } from "@/lib/format";
import { cap, rowState } from "@/lib/queueRules";
import { expireNoShows } from "@/lib/queueServer";
import { AutoRefresh, CancelRow, Countdown, RowAction, Verify } from "./QueueBoard";

export const dynamic = "force-dynamic";

export default async function ProfessorQueue() {
  const uid = ((await getServerSession(authOptions))?.user as any).id as string;
  await expireNoShows({ professorId: uid });
  const now = new Date(), d0 = new Date(now); d0.setHours(0, 0, 0, 0); const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
  const today = { gte: d0, lt: d1 };
  const [s, rows, recent, waits] = await Promise.all([
    prisma.professorSettings.findUnique({ where: { professorId: uid } }),
    prisma.appointment.findMany({ where: { professorId: uid, startsAt: today, status: { in: ["APPROVED", "CHECKED_IN", "IN_CONSULTATION", "NO_SHOW", "COMPLETED"] } }, include: { student: true }, orderBy: [{ startsAt: "asc" }, { queueNumber: "asc" }] }),
    prisma.appointment.findMany({ where: { professorId: uid, checkedInAt: { gte: d0, lt: d1 } }, include: { student: true }, orderBy: { checkedInAt: "desc" }, take: 5 }),
    prisma.waitlistEntry.findMany({ where: { professorId: uid, status: { in: ["WAITING", "OFFERED"] }, startsAt: { gte: now, lt: d1 } }, orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }], take: 5 }),
  ]);
  const grace = s?.graceMin ?? 5, auto = s?.autoCancel ?? true;
  const queue = rows.filter((a) => a.status !== "COMPLETED"), done = rows.length - queue.length;
  const serving = queue.some((a) => a.status === "IN_CONSULTATION");

  // First waitlisted slot that is actually free today.
  const taken = new Set(rows.filter((a) => a.status !== "NO_SHOW").map((a) => a.startsAt.getTime()));
  const open = waits.find((w) => !taken.has(w.startsAt.getTime()));
  const first = open && (await prisma.user.findUnique({ where: { id: open.studentId }, select: { name: true } }));

  return (
    <div>
      <AutoRefresh />
      <h1 className="text-3xl font-bold">Queue & attendance</h1>
      <p className="mt-1 text-muted">Today, {fmtDay(now)}{s?.room ? ` · Room ${s.room}` : ""} · {s?.durationMin ?? 30}-minute slots · {grace}-minute check-in grace</p>

      <div className="mt-6 grid grid-cols-[1fr_340px] gap-6">
        <section className="card self-start !p-6">
          <h2 className="text-xl font-bold">Today's queue</h2>
          {!queue.length && <p className="mt-3 rounded-xl bg-canvas p-4 text-sm text-slate-600">{done ? `All ${done} consultations today are complete.` : "No approved consultations today. Approved requests for today appear here in queue order."}</p>}
          <div className="mt-4 space-y-3">
            {queue.map((a, i) => {
              const st = rowState(a.status, a.startsAt, now), p = PRIORITY[a.priority], online = a.mode === "ONLINE";
              const ahead = queue.slice(0, i).filter((x) => x.status !== "NO_SHOW").length;
              const box = st === "serving" ? "border-2 border-brand bg-tint" : st === "late" || st === "noshow" ? "border border-red-200 bg-red-50" : "border border-line bg-white";
              const num = st === "serving" ? "bg-brand text-white" : st === "late" || st === "noshow" ? "bg-red-100 text-red-700" : "bg-gray-100";
              const mins = a.startedAt ? Math.max(0, Math.round((now.getTime() - a.startedAt.getTime()) / 60000)) : 0;
              return (
                <article key={a.id} className={`rounded-2xl p-4 ${box}`}>
                  <div className="flex items-start gap-3">
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-xl font-bold ${num}`}>{a.queueNumber ?? i + 1}</span>
                    <div className="min-w-0 flex-1"><h3 className="font-bold">{a.student.name}</h3><p className="text-sm text-slate-600">{cap(a.concern)} · {a.title}{online && " · Online"} · {fmtTime(a.startsAt)}</p></div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${p.cls}`}><i className={`mr-1.5 inline-block h-2 w-2 rounded-full ${p.dot}`} />{p.label}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {st === "serving" && <><span className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">In consultation · {mins} min</span><RowAction id={a.id} action="complete" label="Complete" style="solid" /></>}
                    {st === "ready" && <><span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">Checked in · {a.checkedInAt && fmtTime(a.checkedInAt)}</span><RowAction id={a.id} action="call" label="Call next" style="outline" disabled={serving} /><CancelRow id={a.id} name={a.student.name} /></>}
                    {st === "waiting" && <><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-slate-600">Waiting · est. {estimateWait(ahead)} min</span><CancelRow id={a.id} name={a.student.name} /></>}
                    {st === "late" && <><span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">Not checked in{auto && <> · auto-cancel in <Countdown to={new Date(a.startsAt.getTime() + grace * 60000).toISOString()} /></>}</span><RowAction id={a.id} action="override" label="Override cancellation" style="danger" /><CancelRow id={a.id} name={a.student.name} /></>}
                    {st === "noshow" && <><span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">No-show · slot cancelled</span><RowAction id={a.id} action="override" label="Override cancellation" style="danger" /></>}
                  </div>
                </article>);
            })}
          </div>
          {done > 0 && !!queue.length && <p className="mt-4 text-sm text-muted">Completed today · {done}</p>}
        </section>

        <aside className="space-y-5">
          <section className="card"><h2 className="mb-3 text-lg font-bold">Verify attendance</h2><Verify /></section>
          <section className="card"><h2 className="mb-3 text-lg font-bold">Recent check-ins</h2>
            {recent.length ? <ul className="space-y-2 text-sm">{recent.map((a) => (
              <li key={a.id} className="flex justify-between gap-3"><span><b>{a.student.name}</b> · {a.mode === "ONLINE" ? "Online sign-in" : a.qrUsedAt ? "QR verified" : "Admitted by you"}</span><span className="text-slate-600">{fmtTime(a.checkedInAt!)}</span></li>))}</ul>
              : <p className="text-sm text-slate-600">No check-ins yet today.</p>}
            <p className="mt-3 text-xs text-muted">Attendance is recorded automatically on every verified check-in.</p></section>
          <section className="card"><h2 className="mb-2 text-lg font-bold">Open slot</h2>
            {open ? <><p className="text-sm text-slate-700">{fmtTime(open.startsAt)} is free. {first?.name ?? "A student"} is first on the waitlist.</p>
              <Link href="/professor/dashboard" className="mt-2 inline-block text-sm font-semibold text-brand underline">Review replacement request</Link></>
              : <p className="text-sm text-slate-600">No open slots with a waitlist today.</p>}</section>
        </aside>
      </div>
    </div>
  );
}