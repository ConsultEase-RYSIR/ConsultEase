import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dayFor, slotKey } from "@/lib/slots";

export async function GET(req: Request) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams, pid = q.get("professorId") ?? "", date = q.get("date") ?? "";
  if (!pid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const d = await dayFor(pid, date);
  if (!d) return NextResponse.json({ slots: [], modes: null });
  const booked = await prisma.appointment.findMany({ where: { slotKey: { in: d.times.map((t) => slotKey(pid, t)) } }, select: { startsAt: true } });
  const taken = new Set(booked.map((b) => b.startsAt.getTime()));
  const now = Date.now();
  return NextResponse.json({
    modes: { faceToFace: d.day.faceToFace, online: d.day.online },
    slots: d.times.map((t) => ({ startsAt: t.toISOString(), status: t.getTime() <= now ? "past" : taken.has(t.getTime()) ? "booked" : "open" })),
  });
}
