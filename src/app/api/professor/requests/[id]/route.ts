import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireProfessor } from "@/lib/requireProfessor";
import { BLOCKING, manilaAt, openSlots } from "@/lib/openSlots";
import { manilaParts } from "@/lib/availability";
import { fmtDay, fmtTime, fmtRange } from "@/lib/format";
import { sendApprovalEmail, sendCancellationEmail, trySend } from "@/lib/email";

const err = (error: string, status = 400) => NextResponse.json({ error }, { status });
const PRIORITIES = ["HIGH", "MODERATE", "REGULAR"];
const APPROVED_LIKE = ["APPROVED", "WAITING", "CHECKED_IN", "IN_CONSULTATION", "LATE"] as const;

async function load(id: string) {
  const prof = await requireProfessor();
  if (!prof) return { prof: null, appt: null };
  const appt = await prisma.appointment.findUnique({ where: { id } });
  return { prof, appt: appt && appt.professorId === prof.id ? appt : null };
}

// Open slots the professor can move this request to.
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { prof, appt } = await load(params.id);
  if (!prof) return err("Sign in as a professor.", 403);
  if (!appt) return err("Request not found.", 404);
  return NextResponse.json({ slots: await openSlots(prof.id, appt.mode) });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { prof, appt } = await load(params.id);
  if (!prof) return err("Sign in as a professor.", 403);
  if (!appt) return err("Request not found.", 404);
  if (appt.status !== "PENDING") return err("This request was already handled. Refresh the page.", 409);
  let body: any;
  try { body = await req.json(); } catch { return err("Invalid request."); }
  const when = `${fmtDay(appt.startsAt)} at ${fmtTime(appt.startsAt)}`;

  if (body.action === "decline") {
    const r = await prisma.appointment.updateMany({ where: { id: appt.id, status: "PENDING" }, data: { status: "DECLINED", slotKey: null } });
    if (r.count !== 1) return err("This request was already handled. Refresh the page.", 409);
    await prisma.notification.create({ data: { userId: appt.studentId, href: "/student/dashboard", text: `Declined: ${appt.title} with ${prof.name} on ${when}. You can request another slot.` } });
    const student = await prisma.user.findUnique({ where: { id: appt.studentId }, select: { name: true, email: true } });
    if (student?.email) await trySend(sendCancellationEmail(student.email, {
      recipientName: student.name, actorName: prof.name, kind: "DECLINED", title: appt.title,
      when: `${fmtDay(appt.startsAt)}, ${fmtRange(appt.startsAt, appt.endsAt)}`, mode: appt.mode === "ONLINE" ? "Online" : "Face-to-face",
      link: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/student/dashboard`,
    }));
    return NextResponse.json({ ok: true });
  }

  if (body.action === "approve") {
    if (!PRIORITIES.includes(body.priority)) return err("Choose a priority.");
    const clash = await prisma.appointment.findFirst({
      where: { professorId: prof.id, id: { not: appt.id }, status: { in: [...APPROVED_LIKE] }, startsAt: { lt: appt.endsAt }, endsAt: { gt: appt.startsAt } },
      include: { student: { select: { name: true } } },
    });
    if (clash) return err(`This overlaps with ${clash.student.name} at ${fmtTime(clash.startsAt)}. Reschedule instead.`, 409);
    const dayKey = manilaParts(appt.startsAt).dateKey;
    const last = await prisma.appointment.aggregate({
      _max: { queueNumber: true },
      where: { professorId: prof.id, startsAt: { gte: manilaAt(dayKey), lt: manilaAt(dayKey, 1440) } },
    });
    const r = await prisma.appointment.updateMany({
      where: { id: appt.id, status: "PENDING" },
      data: { status: "APPROVED", priority: body.priority, queueNumber: (last._max.queueNumber ?? 0) + 1, qrToken: crypto.randomBytes(16).toString("hex") },
    });
    if (r.count !== 1) return err("This request was already handled. Refresh the page.", 409);
    await prisma.notification.create({ data: { userId: appt.studentId, href: "/student/queue", text: `Approved: ${appt.title} with ${prof.name} on ${when}. Your QR code is ready.` } });
    const [student, settings] = await Promise.all([
      prisma.user.findUnique({ where: { id: appt.studentId }, select: { name: true, email: true } }),
      prisma.professorSettings.findUnique({ where: { professorId: prof.id } }),
    ]);
    if (student?.email) await trySend(sendApprovalEmail(student.email, {
      studentName: student.name, professorName: prof.name, title: appt.title,
      when: `${fmtDay(appt.startsAt)}, ${fmtRange(appt.startsAt, appt.endsAt)}`, mode: appt.mode === "ONLINE" ? "Online" : "Face-to-face",
      priority: ({ HIGH: "High", MODERATE: "Moderate", REGULAR: "Regular" } as Record<string, string>)[body.priority] ?? body.priority,
      queueNumber: (last._max.queueNumber ?? 0) + 1,
      location: [settings?.building, settings?.floor, settings?.room].filter(Boolean).join(", ") || null,
      meetingLink: settings?.meetingLink ?? null,
      link: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/student/queue`,
    }));
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reschedule") {
    const slot = (await openSlots(prof.id, appt.mode)).find((s) => s.startsAt === body.startsAt);
    if (!slot) return err("That slot is no longer open. Pick another one.", 409);
    try {
      const r = await prisma.appointment.updateMany({
        where: { id: appt.id, status: "PENDING" },
        data: { startsAt: new Date(slot.startsAt), endsAt: new Date(slot.endsAt), slotKey: `${prof.id}:${slot.startsAt}` },
      });
      if (r.count !== 1) return err("This request was already handled. Refresh the page.", 409);
    } catch (e: any) {
      if (e?.code === "P2002") return err("That slot was just taken. Pick another one.", 409);
      throw e;
    }
    await prisma.notification.create({ data: { userId: appt.studentId, href: "/student/dashboard", text: `Schedule change: ${prof.name} moved your ${appt.title} request from ${when} to ${slot.day} at ${slot.time}. It is still waiting for approval.` } });
    return NextResponse.json({ ok: true });
  }
  return err("Unknown action.");
}