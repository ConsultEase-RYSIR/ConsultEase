import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProfessorId } from "@/lib/notesAuth";
import { canWriteNotes, LIMITS } from "@/lib/notesRules";

// Autosave for the private consultation notes only.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const uid = await getProfessorId();
  if (!uid) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.privateNotes !== "string") return NextResponse.json({ error: "Invalid notes." }, { status: 400 });
  if (body.privateNotes.length > LIMITS.notes) return NextResponse.json({ error: `Notes can be up to ${LIMITS.notes.toLocaleString()} characters.` }, { status: 400 });

  const a = await prisma.appointment.findFirst({ where: { id: params.id, professorId: uid }, select: { id: true, status: true } });
  if (!a) return NextResponse.json({ error: "Consultation not found." }, { status: 404 });
  if (!canWriteNotes(a.status)) return NextResponse.json({ error: "Notes open once the consultation starts." }, { status: 409 });

  await prisma.consultationRecord.upsert({
    where: { appointmentId: a.id },
    create: { appointmentId: a.id, privateNotes: body.privateNotes },
    update: { privateNotes: body.privateNotes },
  });
  return NextResponse.json({ ok: true });
}
