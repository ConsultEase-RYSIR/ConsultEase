import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDay, fmtTime, fmtRange } from "@/lib/format";
import { sendCancellationEmail, trySend } from "@/lib/email";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// Queue actions for the professor who owns the appointment: call, complete, override, cancel.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = (await getServerSession(authOptions))?.user as any;
  if (u?.role !== "PROFESSOR") return fail("Sign in as a professor.", 401);
  const { action } = await req.json().catch(() => ({}));
  const a = await prisma.appointment.findFirst({ where: { id: params.id, professorId: u.id } });
  if (!a) return fail("Appointment not found.", 404);
  const now = new Date(), notify = (text: string, href = `/student/queue?appt=${a.id}`) => prisma.notification.create({ data: { userId: a.studentId, text, href } });

  if (action === "call") {
    if (a.status !== "CHECKED_IN") return fail("Only checked-in students can be called.", 409);
    if (await prisma.appointment.findFirst({ where: { professorId: u.id, status: "IN_CONSULTATION" } })) return fail("Complete the current consultation first.", 409);
    const r = await prisma.appointment.updateMany({ where: { id: a.id, status: "CHECKED_IN" }, data: { status: "IN_CONSULTATION", startedAt: now } });
    if (!r.count) return fail("This appointment just changed. Refresh and try again.", 409);
    await notify(`${u.name} is ready for you. Please come in${a.queueNumber ? ` (queue #${a.queueNumber})` : ""}.`);
    return NextResponse.json({ ok: true });
  }
  if (action === "complete") {
    const r = await prisma.appointment.updateMany({ where: { id: a.id, status: "IN_CONSULTATION" }, data: { status: "COMPLETED", qrToken: null } });
    if (!r.count) return fail("This consultation isn't in progress.", 409);
    await notify("Your consultation is complete. Feedback appears under History & feedback once your professor sends it.", "/student/history");
    return NextResponse.json({ ok: true });
  }
  if (action === "override") {
    if (a.status !== "APPROVED" && a.status !== "NO_SHOW") return fail("There is no cancellation to override.", 409);
    try {
      const r = await prisma.appointment.updateMany({
        where: { id: a.id, status: a.status },
        data: { status: "CHECKED_IN", checkedInAt: now, ...(a.status === "NO_SHOW" ? { slotKey: `${a.professorId}:${a.startsAt.toISOString()}` } : {}) },
      });
      if (!r.count) return fail("This appointment just changed. Refresh and try again.", 409);
    } catch { return fail("That slot was taken by another booking, so it can't be restored.", 409); }
    await notify(`${u.name} kept your consultation. You're checked in.`);
    return NextResponse.json({ ok: true });
  }
  if (action === "cancel") {
    if (a.status !== "APPROVED" && a.status !== "CHECKED_IN") return fail("Only waiting or checked-in consultations can be cancelled.", 409);
    const r = await prisma.appointment.updateMany({ where: { id: a.id, status: a.status }, data: { status: "CANCELLED", slotKey: null, qrToken: null } });
    if (!r.count) return fail("This appointment just changed. Refresh and try again.", 409);
    await notify(`${u.name} cancelled your consultation: ${a.title}, ${fmtDay(a.startsAt)} ${fmtTime(a.startsAt)}. You can request a new appointment.`, "/student/request");
    const stu = await prisma.user.findUnique({ where: { id: a.studentId }, select: { name: true, email: true } });
    if (stu?.email) await trySend(sendCancellationEmail(stu.email, {
      recipientName: stu.name, actorName: u.name, kind: "CANCELLED", title: a.title,
      when: `${fmtDay(a.startsAt)}, ${fmtRange(a.startsAt, a.endsAt)}`, mode: a.mode === "ONLINE" ? "Online" : "Face-to-face",
      link: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/student/request`,
    }));
    return NextResponse.json({ ok: true });
  }
  return fail("Unknown action.", 400);
}