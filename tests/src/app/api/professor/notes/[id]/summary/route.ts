import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProfessorId } from "@/lib/notesAuth";
import { canSendSummary, canWriteNotes, dateToDue, validateSummary } from "@/lib/notesRules";

// Save the summary draft, or send it to the student ({ send: true }). Sending again updates the student's copy.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const uid = await getProfessorId();
  if (!uid) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const send = body?.send === true;

  const a = await prisma.appointment.findFirst({
    where: { id: params.id, professorId: uid },
    include: { professor: { select: { name: true } }, record: { include: { revisions: true } } },
  });
  if (!a) return NextResponse.json({ error: "Consultation not found." }, { status: 404 });
  if (!canWriteNotes(a.status)) return NextResponse.json({ error: "Summaries open once the consultation starts." }, { status: 409 });
  if (send && !canSendSummary(a.status)) return NextResponse.json({ error: "Complete the consultation before sending the summary." }, { status: 409 });
  const wasSent = a.record?.status === "SENT";
  if (wasSent && !send) return NextResponse.json({ error: "This summary was already sent. Use Update to change what the student sees." }, { status: 409 });

  const v = validateSummary(body, a.startsAt, send);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const { concerns, feedback, revisions } = v.value;

  const existing = new Map((a.record?.revisions ?? []).map((r) => [r.id, r]));
  if (revisions.some((r) => r.id && !existing.has(r.id))) return NextResponse.json({ error: "A revision no longer exists. Reload the page." }, { status: 409 });

  const now = new Date();
  const record = await prisma.$transaction(async (tx) => {
    const rec = await tx.consultationRecord.upsert({
      where: { appointmentId: a.id },
      create: { appointmentId: a.id, concerns, feedback },
      update: { concerns, feedback },
    });
    const keep = new Set(revisions.filter((r) => r.id).map((r) => r.id!));
    const gone = [...existing.keys()].filter((id) => !keep.has(id));
    if (gone.length) await tx.revision.deleteMany({ where: { id: { in: gone }, recordId: rec.id } });
    for (const r of revisions) {
      if (r.id) await tx.revision.update({ where: { id: r.id }, data: { text: r.text, dueDate: r.dueDate } }); // keeps the student's tick
      else await tx.revision.create({ data: { recordId: rec.id, text: r.text, dueDate: r.dueDate } });
    }
    if (send) {
      await tx.consultationRecord.update({ where: { id: rec.id }, data: { status: "SENT", sentAt: rec.sentAt ?? now } });
      await tx.notification.create({ data: {
        userId: a.studentId, href: "/student/history",
        text: wasSent ? `${a.professor.name} updated the feedback for your "${a.title}" consultation.` : `${a.professor.name} sent feedback for your "${a.title}" consultation.`,
      } });
    }
    return tx.consultationRecord.findUniqueOrThrow({ where: { id: rec.id }, include: { revisions: { orderBy: { dueDate: "asc" } } } });
  });

  return NextResponse.json({ record: {
    status: record.status, sentAt: record.sentAt, concerns: record.concerns, feedback: record.feedback,
    revisions: record.revisions.map((r) => ({ id: r.id, text: r.text, due: dateToDue(r.dueDate), done: !!r.completedAt })),
  } });
}
