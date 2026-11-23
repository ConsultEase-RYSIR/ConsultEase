import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dayFor, manilaDate, slotKey } from "@/lib/slots";
import { fmtDay, fmtRange } from "@/lib/format";
import { sendConsultationRequestEmail } from "@/lib/email";
import { CONCERNS, REQUIRED_DOCS, suggestPriority, ConcernKey } from "@/lib/priority";

export async function POST(req: Request) {
  const s = await getServerSession(authOptions), me = s?.user as any;
  if (!me || me.role !== "STUDENT") return NextResponse.json({ error: "Only students can request consultations." }, { status: 403 });
  const b = await req.json();
  const startsAt = new Date(b.startsAt), concern = b.concern as ConcernKey;
  if (isNaN(+startsAt) || !CONCERNS.some((c) => c.value === concern) || !["FACE_TO_FACE", "ONLINE"].includes(b.mode) || !String(b.description ?? "").trim())
    return NextResponse.json({ error: "Please complete every required field." }, { status: 400 });
  if (startsAt.getTime() <= Date.now()) return NextResponse.json({ error: "That time has already passed." }, { status: 400 });

  const d = await dayFor(b.professorId, manilaDate(startsAt));           // server re-checks everything the UI showed
  if (!d || !d.times.some((t) => t.getTime() === startsAt.getTime())) return NextResponse.json({ error: "That slot isn't available." }, { status: 400 });
  if ((b.mode === "ONLINE" && !d.day.online) || (b.mode === "FACE_TO_FACE" && !d.day.faceToFace)) return NextResponse.json({ error: "That mode isn't offered on this day." }, { status: 400 });

  const label = CONCERNS.find((c) => c.value === concern)!.label;
  try {
    const a = await prisma.appointment.create({ data: {
      studentId: me.id, professorId: b.professorId, startsAt, endsAt: new Date(startsAt.getTime() + d.settings.durationMin * 60_000),
      mode: b.mode, concern, title: `${label} consultation`, description: String(b.description).trim(),
      deadline: b.deadline ? new Date(`${b.deadline}T00:00:00+08:00`) : null, priority: suggestPriority(concern, b.deadline || null),
      status: "PENDING", slotKey: slotKey(b.professorId, startsAt),                  // unique => no double-booking, even in a race
      documents: { create: REQUIRED_DOCS[concern].map((x) => ({ requirement: x.name, required: x.required })) },
    } });
    await prisma.notification.create({ data: { userId: b.professorId, text: `New consultation request from ${me.name}.`, href: "/professor/dashboard" } });
    // Email the professor too. A mail failure must never undo or block the booking.
    try {
      const prof = await prisma.user.findUnique({ where: { id: b.professorId }, select: { email: true, name: true } });
      if (prof?.email) {
        await sendConsultationRequestEmail(prof.email, {
          professorName: prof.name, studentName: me.name, studentEmail: me.email ?? "",
          concern: label, mode: b.mode === "ONLINE" ? "Online" : "Face-to-face",
          when: `${fmtDay(a.startsAt)}, ${fmtRange(a.startsAt, a.endsAt)}`,
          deadline: a.deadline ? fmtDay(a.deadline) : null, description: a.description, priority: a.priority,
        }, `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/professor/dashboard`);
      }
    } catch (err: any) {
      console.error("Professor request email failed:", err?.message);
    }
    return NextResponse.json({ ok: true, id: a.id });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Someone just booked that slot. Pick another or join the waitlist." }, { status: 409 });
    throw e;
  }
}