import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDay } from "@/lib/format";
import { checkReview } from "@/lib/documentReview";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const OPEN = ["PENDING", "APPROVED", "CHECKED_IN", "IN_CONSULTATION"];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = (await getServerSession(authOptions))?.user as any;
  if (u?.role !== "PROFESSOR") return fail("Sign in as a professor.", 401);
  const { action, comment: raw } = await req.json().catch(() => ({}));
  const comment = String(raw ?? "").trim();
  const d = await prisma.document.findFirst({ where: { id: params.id, appointment: { professorId: u.id } }, include: { appointment: true } });
  if (!d) return fail("Document not found.", 404);
  const a = d.appointment, href = `/student/documents?appt=${a.id}&doc=${d.id}`;
  const notify = (text: string) => prisma.notification.create({ data: { userId: a.studentId, text, href } });

  if (action === "remind") {
    if (d.status !== "MISSING" || !OPEN.includes(a.status)) return fail("There is nothing to remind the student about.", 409);
    const recent = await prisma.notification.findFirst({ where: { userId: a.studentId, href, text: { startsWith: "Reminder:" }, createdAt: { gte: new Date(Date.now() - 12 * 3600e3) } } });
    if (recent) return fail("You already sent a reminder in the last 12 hours.", 409);
    await notify(`Reminder: ${u.name} is waiting for your ${d.requirement} for the ${fmtDay(a.startsAt)} consultation.`);
    return NextResponse.json({ ok: true });
  }

  const err = checkReview(action, comment, d.status);
  if (err) return fail(err, 400);
  if (!d.storageKey) return fail("The student hasn't uploaded a file yet.", 409);
  const r = await prisma.document.updateMany({ where: { id: d.id, status: d.status }, data: { status: action === "reviewed" ? "REVIEWED" : "NEEDS_FIX", professorComment: comment || null } });
  if (!r.count) return fail("This file just changed. Refresh and try again.", 409);
  await notify(action === "reviewed" ? `${u.name} reviewed your ${d.requirement}.${comment ? " See their comment." : ""}` : `${u.name} asked for a revision of your ${d.requirement}: ${comment.slice(0, 140)}`);
  return NextResponse.json({ ok: true });
}
