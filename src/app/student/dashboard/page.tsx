import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtMin } from "@/lib/availability";
import { ago, estimateWait, fmtDay, fmtRange, PRIORITY } from "@/lib/format";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function StudentDashboard() {
  const uid = ((await getServerSession(authOptions))?.user as any).id as string;
  const now = new Date(), start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const [user, upcoming, pending, waitlist, docsToSubmit, notifs, profs, unread] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: uid } }),
    prisma.appointment.findMany({ where: { studentId: uid, status: { in: ["APPROVED", "CHECKED_IN", "IN_CONSULTATION"] }, endsAt: { gte: now } }, include: { professor: { include: { settings: true } } }, orderBy: { startsAt: "asc" } }),
    prisma.appointment.findMany({ where: { studentId: uid, status: "PENDING" }, include: { professor: true }, orderBy: { startsAt: "asc" } }),
    prisma.waitlistEntry.count({ where: { studentId: uid, status: { in: ["WAITING", "OFFERED"] } } }),
    prisma.document.count({ where: { required: true, status: { in: ["MISSING", "NEEDS_FIX"] }, appointment: { studentId: uid, status: { in: ["PENDING", "APPROVED"] } } } }),
    prisma.notification.findMany({ where: { userId: uid }, orderBy: { createdAt: "desc" }, take: 4 }),
    prisma.user.findMany({ where: { role: "PROFESSOR", availability: { some: { enabled: true } } }, include: { availability: { where: { enabled: true }, orderBy: { weekday: "asc" } } } }),
    prisma.notification.count({ where: { userId: uid, readAt: null } }),
  ]);

  // Live queue for today's face-to-face appointment: "now serving" = the professor's in-consultation number.
  const today = upcoming.find((a) => a.mode === "FACE_TO_FACE" && a.queueNumber && a.startsAt >= start && a.startsAt < end);
  const serving = today && (await prisma.appointment.findFirst({ where: { professorId: today.professorId, status: "IN_CONSULTATION", startsAt: { gte: start, lt: end } } }));
  const nowServing = serving?.queueNumber ?? 0;
  const stats = [["Upcoming", upcoming.length, "/student/queue"], ["Pending requests", pending.length, "#pending"], ["Documents to submit", docsToSubmit, "/student/documents"], ["On waitlist", waitlist, "/student/queue#waitlist"]] as const;

  if (!upcoming.length && !pending.length)
    return (
      <div className="mx-auto max-w-xl pt-24 text-center">
        <h1 className="text-3xl font-bold">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="mt-2 text-muted">You have no consultations yet. Pick an open slot with one of your professors.</p>
        <Link href="/student/request" className="btn mt-6">Request consultation</Link>
      </div>);

  return (
    <div>
      <header className="flex items-start justify-between">
        <div><h1 className="text-3xl font-bold">Welcome back, {user.name.split(" ")[0]}</h1><p className="mt-1 text-muted">Here is what is coming up with your professors.</p></div>
        <div className="flex items-center gap-3">
          <Link href="/student/notifications" aria-label="Notifications" className="relative grid h-11 w-11 place-items-center rounded-xl border border-line bg-white">🔔
            {unread > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-red-700 text-[11px] font-bold text-white">{unread}</span>}</Link>
          <Link href="/student/request" className="btn !px-5">Request consultation</Link>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-4 gap-4">
        {stats.map(([label, n, href]) => (
          <Link key={label} href={href} className="card block hover:border-brand"><span className="text-sm text-muted">{label}</span><b className="block text-4xl">{n}</b></Link>))}
      </div>

      <div className="mt-8 grid grid-cols-[1fr_340px] gap-6">
        <section>
          <h2 className="mb-3 text-xl font-bold">Upcoming consultations</h2>
          <div className="space-y-4">
            {upcoming.map((a) => {
              const p = PRIORITY[a.priority], s = a.professor.settings, online = a.mode === "ONLINE";
              return (
                <article key={a.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="text-lg font-bold">{a.title}</h3><p className="text-sm text-muted">{a.professor.name} · {fmtDay(a.startsAt)} · {fmtRange(a.startsAt, a.endsAt)}</p></div>
                    <div className="flex gap-2 text-xs font-semibold"><span className={`rounded-full px-3 py-1 ${p.cls}`}><i className={`mr-1.5 inline-block h-2 w-2 rounded-full ${p.dot}`} />{p.label}</span><span className="rounded-full bg-tint px-3 py-1 text-brand">Approved</span></div>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{online ? "Online   Meeting link opens 10 minutes before start" : `Face-to-face   ${s?.building} · ${s?.floor} · Room ${s?.room}`}</p>
                  {!online && a.queueNumber && <p className="mt-3 text-sm text-slate-600">Queue #{a.queueNumber} · about {estimateWait(a.queueNumber - nowServing)} min wait</p>}
                  <div className="mt-4 flex items-center gap-3">
                    {online ? <Link href={`/student/queue?appt=${a.id}`} className="btn">Check in online</Link> : <Link href={`/student/queue?appt=${a.id}`} className="btn">Show QR code</Link>}
                    {!online && <Link href={`/student/documents?appt=${a.id}`} className="btn-ghost">Documents</Link>}
                    <Link href={`/student/queue?appt=${a.id}#cancel`} className="px-3 text-sm font-semibold text-red-700">Cancel</Link>
                  </div>
                </article>);
            })}
            {pending.map((a) => (
              <Link id="pending" key={a.id} href={`/student/queue?appt=${a.id}`} className="flex items-center justify-between rounded-2xl border border-dashed border-gray-300 bg-white p-5">
                <div><b>{a.title}</b><p className="text-sm text-muted">{a.professor.name} · {fmtDay(a.startsAt)} · requested, waiting for approval</p></div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-slate-600">Pending</span>
              </Link>))}
          </div>
        </section>

        <aside className="space-y-5">
          {today && (
            <Link href={`/student/queue?appt=${today.id}`} className="block rounded-2xl bg-ink p-6 text-white">
              <span className="text-sm text-slate-400">Your queue number today</span><b className="block text-6xl">#{today.queueNumber}</b>
              <span className="text-sm">Now serving #{nowServing || "–"} · estimated wait {estimateWait(today.queueNumber! - nowServing)} min</span>
            </Link>)}
          <section className="card"><h2 className="mb-3 text-lg font-bold">Notifications</h2>
            <ul className="divide-y divide-line text-sm">{notifs.map((n) => (
              <li key={n.id} className="py-3 first:pt-0"><Link href={n.href} className="block"><span>{n.text}</span><span className="block text-xs text-muted">{ago(n.createdAt)}</span></Link></li>))}
              {!notifs.length && <li className="text-muted">You're all caught up.</li>}</ul></section>
          <section className="card"><h2 className="mb-3 text-lg font-bold">Professors open this week</h2>
            <ul className="space-y-2 text-sm">{profs.map((p) => (
              <li key={p.id} className="flex justify-between gap-3"><b>{p.name}</b><span className="text-slate-600">{p.availability.map((d) => DAYS[d.weekday]).join(", ")} · {fmtMin(p.availability[0].startMin)} – {fmtMin(p.availability[0].endMin)}</span></li>))}</ul>
            <Link href="/student/request" className="mt-3 inline-block text-sm font-semibold text-brand underline">See all availability</Link></section>
        </aside>
      </div>
    </div>
  );
}