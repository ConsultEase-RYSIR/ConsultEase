import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDay, fmtTime, fmtRange } from "@/lib/format";
import { sendCancellationEmail, trySend } from "@/lib/email";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = (await getServerSession(authOptions))?.user as any;
  if (u?.role !== "STUDENT") return NextResponse.json({ error: "Sign in as a student." }, { status: 401 });
  const { reschedule } = await req.json().catch(() => ({}));
  const a = await prisma.appointment.findFirst({ where: { id: params.id, studentId: u.id } });
  if (!a) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
  if (a.status !== "PENDING" && a.status !== "APPROVED" && a.status !== "CHECKED_IN") return NextResponse.json({ error: "This appointment can no longer be cancelled." }, { status: 409 });
  const r = await prisma.appointment.updateMany({ where: { id: a.id, status: a.status }, data: { status: "CANCELLED", slotKey: null, qrToken: null } });
  if (!r.count) return NextResponse.json({ error: "This appointment just changed. Refresh and try again." }, { status: 409 });
  await prisma.notification.create({ data: { userId: a.professorId, text: `${u.name} ${reschedule ? "is rescheduling" : "cancelled"}: ${a.title}, ${fmtDay(a.startsAt)} ${fmtTime(a.startsAt)}.`, href: "/professor/dashboard" } });
  const prof = await prisma.user.findUnique({ where: { id: a.professorId }, select: { name: true, email: true } });
  if (prof?.email) await trySend(sendCancellationEmail(prof.email, {
    recipientName: prof.name, actorName: u.name, kind: reschedule ? "RESCHEDULING" : "CANCELLED", title: a.title,
    when: `${fmtDay(a.startsAt)}, ${fmtRange(a.startsAt, a.endsAt)}`, mode: a.mode === "ONLINE" ? "Online" : "Face-to-face",
    link: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/professor/dashboard`,
  }));
  return NextResponse.json({ ok: true });
}