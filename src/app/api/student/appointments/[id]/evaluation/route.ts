import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateEvaluation } from "@/lib/history";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = (await getServerSession(authOptions))?.user as any;
  if (u?.role !== "STUDENT") return NextResponse.json({ error: "Sign in as a student." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const v = validateEvaluation(body.rating, body.comment);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const a = await prisma.appointment.findFirst({ where: { id: params.id, studentId: u.id, status: "COMPLETED" }, include: { evaluation: true } });
  if (!a) return NextResponse.json({ error: "You can only rate a completed consultation." }, { status: 404 });
  await prisma.evaluation.upsert({ where: { appointmentId: a.id }, create: { appointmentId: a.id, rating: v.rating, comment: v.comment || null }, update: { rating: v.rating, comment: v.comment || null } });
  if (!a.evaluation) await prisma.notification.create({ data: { userId: a.professorId, text: `${u.name} rated the "${a.title}" consultation ${v.rating} out of 5.`, href: "/professor/notes" } });
  return NextResponse.json({ ok: true });
}
