import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProfessor } from "@/lib/requireProfessor";
import { fmtDay, fmtTime } from "@/lib/format";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const prof = await requireProfessor();
  if (!prof) return NextResponse.json({ error: "Sign in as a professor." }, { status: 403 });
  const entry = await prisma.waitlistEntry.findUnique({ where: { id: params.id } });
  if (!entry || entry.professorId !== prof.id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (entry.status !== "WAITING") return NextResponse.json({ error: "Already handled. Refresh the page." }, { status: 409 });
  const { action } = await req.json().catch(() => ({}));
  if (action !== "approve" && action !== "skip") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const when = `${fmtDay(entry.startsAt)} at ${fmtTime(entry.startsAt)}`;
  await prisma.waitlistEntry.update({ where: { id: entry.id }, data: { status: action === "approve" ? "OFFERED" : "SKIPPED" } });
  if (action === "approve")
    await prisma.notification.create({ data: { userId: entry.studentId, href: "/student/request", text: `Slot opened: ${prof.name}, ${when}. Your waitlist spot is approved. Send a request for it now.` } });
  return NextResponse.json({ ok: true });
}
