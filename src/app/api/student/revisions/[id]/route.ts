import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Student ticks or unticks a required revision from a sent consultation summary.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = (await getServerSession(authOptions))?.user as any;
  if (u?.role !== "STUDENT") return NextResponse.json({ error: "Sign in as a student." }, { status: 401 });
  const { done } = await req.json().catch(() => ({}));
  const rev = await prisma.revision.findFirst({ where: { id: params.id, record: { status: "SENT", appointment: { studentId: u.id } } } });
  if (!rev) return NextResponse.json({ error: "Revision not found." }, { status: 404 });
  await prisma.revision.update({ where: { id: rev.id }, data: { completedAt: done ? new Date() : null } });
  return NextResponse.json({ ok: true });
}
