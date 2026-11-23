import { prisma } from "./prisma";
import { fmtDay, fmtTime, fmtRange } from "./format";
import { sendCancellationEmail, trySend } from "./email";

// Approved appointments whose check-in grace period has passed become NO_SHOW (if the professor
// has automatic cancellation on). The slot is freed and the QR code stops working.
export async function expireNoShows(who: { studentId?: string; professorId?: string }) {
  const now = new Date();
  const late = await prisma.appointment.findMany({
    where: { ...who, status: "APPROVED", startsAt: { lt: now } },
    include: { professor: { include: { settings: true } }, student: { select: { name: true, email: true } } },
  });
  for (const a of late) {
    const grace = a.professor.settings?.graceMin ?? 5;
    if (!(a.professor.settings?.autoCancel ?? true) || a.startsAt.getTime() + grace * 60000 > now.getTime()) continue;
    const r = await prisma.appointment.updateMany({ where: { id: a.id, status: "APPROVED" }, data: { status: "NO_SHOW", slotKey: null, qrToken: null } });
    if (!r.count) continue;
    await prisma.notification.create({ data: { userId: a.studentId, text: `Your ${fmtDay(a.startsAt)} ${fmtTime(a.startsAt)} consultation was cancelled because check-in closed. Request a new appointment.`, href: `/student/queue?appt=${a.id}` } });
    if (a.student.email) await trySend(sendCancellationEmail(a.student.email, {
      recipientName: a.student.name, actorName: a.professor.name, kind: "AUTO_CANCELLED", title: a.title,
      when: `${fmtDay(a.startsAt)}, ${fmtRange(a.startsAt, a.endsAt)}`, mode: a.mode === "ONLINE" ? "Online" : "Face-to-face",
      link: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/student/queue?appt=${a.id}`,
    }));
  }
}