import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkInWindow, fmtOpens } from "@/lib/queueRules";

// Online check-in. Face-to-face appointments check in by QR code, verified by the professor.
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const u = (await getServerSession(authOptions))?.user as any;
  if (u?.role !== "STUDENT") return NextResponse.json({ error: "Sign in as a student." }, { status: 401 });
  const a = await prisma.appointment.findFirst({ where: { id: params.id, studentId: u.id, mode: "ONLINE" }, include: { professor: { include: { settings: true } } } });
  if (!a) return NextResponse.json({ error: "Online appointment not found." }, { status: 404 });
  if (a.status !== "APPROVED") return NextResponse.json({ error: "This appointment can't be checked in." }, { status: 409 });
  const w = checkInWindow(a.startsAt, a.professor.settings?.graceMin ?? 5, true), now = new Date();
  if (now < w.opensAt) return NextResponse.json({ error: `Check-in opens ${fmtOpens(w.opensAt)}.` }, { status: 409 });
  if (now > w.closesAt) return NextResponse.json({ error: "The check-in window has closed." }, { status: 409 });
  const r = await prisma.appointment.updateMany({ where: { id: a.id, status: "APPROVED" }, data: { status: "CHECKED_IN", checkedInAt: now } });
  if (!r.count) return NextResponse.json({ error: "This appointment just changed. Refresh and try again." }, { status: 409 });
  await prisma.notification.create({ data: { userId: a.professorId, text: `${u.name} signed in online for ${a.title}.`, href: "/professor/queue" } });
  return NextResponse.json({ ok: true });
}
