import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireProfessor } from "@/lib/requireProfessor";
import { fmtDay, fmtTime, PRIORITY } from "@/lib/format";
import { fmtMin, generateSlots, manilaParts } from "@/lib/availability";
import { BLOCKING, manilaAt } from "@/lib/openSlots";
import { PendingRequests, WaitlistReplacements, type ReqRow } from "./Actions";
import { NotificationBell } from "@/components/NotificationBell";

export const dynamic = "force-dynamic";
const CONCERN = { THESIS: "Thesis", CAPSTONE: "Capstone", PAPER: "Paper", ACADEMIC: "Academic", OTHER: "Other" } as const;
const BOOKED = ["APPROVED", "WAITING", "CHECKED_IN", "IN_CONSULTATION", "LATE", "COMPLETED"] as const;
const RANK = { HIGH: 0, MODERATE: 1, REGULAR: 2 } as const;

export default async function ProfessorDashboard() {
  const prof = (await requireProfessor())!; // the professor layout already blocks everyone else
  const now = new Date();
  const today = manilaParts(now);
  const dayStart = manilaAt(today.dateKey), dayEnd = manilaAt(today.dateKey, 1440);

  const [pendingRaw, upcoming, todayAppts, todayHours, settings, docsToReview, waitlist, unread] = await Promise.all([
    prisma.appointment.findMany({ where: { professorId: prof.id, status: "PENDING", startsAt: { gte: now } }, include: { student: { select: { name: true } } } }),
    prisma.appointment.findMany({ where: { professorId: prof.id, status: { in: [...BOOKED] }, startsAt: { gte: now } }, include: { student: { select: { name: true } } } }),
    prisma.appointment.findMany({ where: { professorId: prof.id, status: { in: [...BOOKED] }, startsAt: { gte: dayStart, lt: dayEnd } }, include: { student: { select: { name: true } } }, orderBy: { startsAt: "asc" } }),
    prisma.availabilityDay.findFirst({ where: { professorId: prof.id, weekday: today.weekday, enabled: true } }),
    prisma.professorSettings.findUnique({ where: { professorId: prof.id } }),
    prisma.document.count({ where: { appointment: { professorId: prof.id }, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    prisma.waitlistEntry.findMany({ where: { professorId: prof.id, status: "WAITING", startsAt: { gte: now } }, include: { student: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.notification.count({ where: { userId: prof.id, readAt: null } }),
  ]);

  const pending = [...pendingRaw].sort((a, b) => RANK[a.priority] - RANK[b.priority] || +a.startsAt - +b.startsAt);
  const rows: ReqRow[] = pending.map((a) => {
    const clash = upcoming.find((o) => o.startsAt < a.endsAt && o.endsAt > a.startsAt);
    return {
      id: a.id, student: a.student.name, concern: CONCERN[a.concern], title: a.title,
      when: `${fmtDay(a.startsAt)} · ${fmtTime(a.startsAt)}`, mode: a.mode === "ONLINE" ? "Online" : "Face-to-face", priority: a.priority,
      conflict: clash ? `overlaps with ${clash.student.name} at ${fmtTime(clash.startsAt)}. Choose another slot.` : null,
    };
  });

  // Today's schedule: every generated slot, either booked or open, plus any appointment that sits off the slot grid.
  const dur = settings?.durationMin ?? 30;
  const starts = new Map<number, string>();
  if (todayHours) for (const m of generateSlots(todayHours.startMin, todayHours.endMin, dur)) starts.set(+manilaAt(today.dateKey, m), fmtMin(m));
  const schedule = [...starts.keys(), ...todayAppts.map((a) => +a.startsAt)].filter((v, i, all) => all.indexOf(v) === i).sort((a, b) => a - b).map((t) => {
    const a = todayAppts.find((x) => +x.startsAt === t || (x.startsAt.getTime() < t && x.endsAt.getTime() > t));
    return { t, time: starts.get(t) ?? fmtTime(new Date(t)), text: a ? `${a.student.name} · ${CONCERN[a.concern]}${a.mode === "ONLINE" ? " · Online" : ""}` : "Open slot", open: !a };
  });

  const load = { HIGH: 0, MODERATE: 0, REGULAR: 0 };
  for (const a of [...pendingRaw, ...upcoming]) load[a.priority]++;
  const maxLoad = Math.max(1, ...Object.values(load));

  const stats: [string, number][] = [["Pending requests", pending.length], ["Today's consultations", todayAppts.length], ["Documents to review", docsToReview], ["Waitlist replacements", waitlist.length]];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-3xl font-bold">Consultation workload</h1><p className="mt-1 text-muted">Requests waiting for you and what is on your schedule today.</p></div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
  <NotificationBell href="/professor/notifications" count={unread} />
  <Link href="/professor/availability" className="btn">Set availability</Link>
</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(([label, n]) => <div key={label} className="card"><div className="text-sm text-muted">{label}</div><div className="mt-1 text-4xl font-bold">{n}</div></div>)}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <PendingRequests rows={rows} />
        <div className="space-y-5">
          <section className="card">
            <h2 className="text-lg font-bold">Today&apos;s schedule</h2>
            {schedule.length === 0 ? <p className="mt-3 text-sm text-muted">No consultation hours today. Open a day under Availability &amp; settings.</p> : (
              <div className="mt-3 space-y-2">
                {schedule.map((s) => (
                  <div key={s.t} className={`flex gap-4 rounded-xl px-3 py-2.5 text-sm ${s.open ? "bg-gray-100 text-muted" : "bg-tint"}`}><b className="w-[68px] shrink-0">{s.time}</b><span>{s.text}</span></div>))}
              </div>)}
            <Link href="/professor/queue" className="mt-3 inline-block text-sm font-semibold text-brand underline">Open queue</Link>
          </section>
          <section className="card">
            <h2 className="text-lg font-bold">Workload by priority</h2>
            <div className="mt-3 space-y-3">
              {(["HIGH", "MODERATE", "REGULAR"] as const).map((k) => (
                <div key={k}>
                  <div className="flex justify-between text-sm"><b>{PRIORITY[k].label}</b><b>{load[k]}</b></div>
                  <div className="mt-1 h-2 rounded-full bg-gray-100"><div className={`h-2 rounded-full ${PRIORITY[k].dot}`} style={{ width: `${(load[k] / maxLoad) * 100}%` }} /></div>
                </div>))}
            </div>
          </section>
          <WaitlistReplacements rows={waitlist.map((w) => ({ id: w.id, student: w.student.name, when: `${fmtDay(w.startsAt)} ${fmtTime(w.startsAt)}` }))} />
        </div>
      </div>
    </div>
  );
}
