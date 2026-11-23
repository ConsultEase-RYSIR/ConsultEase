import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slotKey } from "@/lib/slots";

export async function POST(req: Request) {
  const me = (await getServerSession(authOptions))?.user as any;
  if (!me || me.role !== "STUDENT") return NextResponse.json({ error: "Only students can join a waitlist." }, { status: 403 });
  const { professorId, startsAt } = await req.json(), at = new Date(startsAt);
  if (!professorId || isNaN(+at)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const full = await prisma.appointment.findUnique({ where: { slotKey: slotKey(professorId, at) } });
  if (!full) return NextResponse.json({ error: "That slot is open. You can book it directly." }, { status: 400 });
  const dupe = await prisma.waitlistEntry.findFirst({ where: { studentId: me.id, professorId, startsAt: at, status: { in: ["WAITING", "OFFERED"] } } });
  if (!dupe) await prisma.waitlistEntry.create({ data: { studentId: me.id, professorId, startsAt: at } });
  return NextResponse.json({ ok: true });
}
