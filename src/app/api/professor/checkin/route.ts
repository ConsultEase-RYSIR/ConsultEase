import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkInWindow } from "@/lib/queueRules";

// Verifies a student's QR code (full token) or the code printed under it (first 8 characters).
export async function POST(req: Request) {
  const u = (await getServerSession(authOptions))?.user as any;
  if (u?.role !== "PROFESSOR") return NextResponse.json({ error: "Sign in as a professor." }, { status: 401 });
  const { code: raw } = await req.json().catch(() => ({}));
  const code = String(raw ?? "").replace(/\s+/g, "");
  if (code.length < 8) return NextResponse.json({ error: "Enter the full code shown under the QR." }, { status: 400 });
  const hits = await prisma.appointment.findMany({
    where: { professorId: u.id, mode: "FACE_TO_FACE", status: "APPROVED", qrToken: { startsWith: code, mode: "insensitive" } },
    include: { student: true, professor: { include: { settings: true } } }, take: 2,
  });
  if (hits.length !== 1) return NextResponse.json({ error: hits.length ? "More than one match. Enter the full code." : "Code not recognised, or already used." }, { status: 404 });
  const a = hits[0], now = new Date(), w = checkInWindow(a.startsAt, a.professor.settings?.graceMin ?? 5, false);
  if (now < w.opensAt) return NextResponse.json({ error: "Too early. Check-in opens 30 minutes before the start." }, { status: 409 });
  if (now > w.closesAt) return NextResponse.json({ error: "The check-in window has closed for this appointment." }, { status: 409 });
  const r = await prisma.appointment.updateMany({ where: { id: a.id, status: "APPROVED" }, data: { status: "CHECKED_IN", checkedInAt: now, qrUsedAt: now } });
  if (!r.count) return NextResponse.json({ error: "Code not recognised, or already used." }, { status: 404 });
  await prisma.notification.create({ data: { userId: a.studentId, text: `You're checked in. Your queue number is #${a.queueNumber ?? "–"}.`, href: `/student/queue?appt=${a.id}` } });
  return NextResponse.json({ ok: true, student: a.student.name, title: a.title, queueNumber: a.queueNumber });
}
