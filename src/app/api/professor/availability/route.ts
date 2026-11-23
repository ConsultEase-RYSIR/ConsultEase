import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DAYS, DURATIONS, GRACES, dayError, findConflicts, type DayInput } from "@/lib/availability";
import { futureAppointments } from "@/lib/availabilityServer";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

export async function PUT(req: Request) {
  const s = await getServerSession(authOptions);
  const uid = (s?.user as any)?.id as string | undefined;
  if (!uid) return bad("Sign in again.", 401);
  const me = await prisma.user.findUnique({ where: { id: uid }, select: { role: true } });
  if (me?.role !== "PROFESSOR") return bad("Only professors can change availability.", 403);

  let body: any;
  try { body = await req.json(); } catch { return bad("Invalid request."); }
  const st = body?.settings;
  if (!st || !Array.isArray(body?.days)) return bad("Invalid request.");

  if (!DURATIONS.includes(st.durationMin) || !GRACES.includes(st.graceMin)) return bad("Choose a listed duration and grace period.");
  const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");
  let link: string | null = typeof st.meetingLink === "string" ? st.meetingLink.trim() : "";
  if (link) {
    try { const u = new URL(link); if (u.protocol !== "https:" && u.protocol !== "http:") throw 0; }
    catch { return bad("The online meeting link must start with https://"); }
  } else link = null;

  const allowed = new Set<number>(DAYS.map((d) => d.weekday));
  const days: DayInput[] = [];
  for (const d of body.days) {
    if (!allowed.has(d?.weekday) || !isInt(d.startMin) || !isInt(d.endMin) || d.startMin < 0 || d.endMin > 1440) return bad("Invalid hours.");
    const day: DayInput = { weekday: d.weekday, enabled: !!d.enabled, startMin: d.startMin, endMin: d.endMin, faceToFace: !!d.faceToFace, online: !!d.online };
    const err = dayError(day, st.durationMin);
    if (err) return bad(err);
    days.push(day);
  }

  const conflicts = findConflicts(days, await futureAppointments(uid));
  if (conflicts.length) return NextResponse.json({ error: "conflict", conflicts }, { status: 409 });

  await prisma.$transaction([
    ...days.map((d) => prisma.availabilityDay.upsert({
      where: { professorId_weekday: { professorId: uid, weekday: d.weekday } },
      update: { enabled: d.enabled, startMin: d.startMin, endMin: d.endMin, faceToFace: d.faceToFace, online: d.online },
      create: { professorId: uid, ...d },
    })),
    prisma.professorSettings.upsert({
      where: { professorId: uid },
      update: { durationMin: st.durationMin, graceMin: st.graceMin, autoCancel: !!st.autoCancel, requireReschedule: !!st.requireReschedule, building: text(st.building), floor: text(st.floor), room: text(st.room), meetingLink: link },
      create: { professorId: uid, durationMin: st.durationMin, graceMin: st.graceMin, autoCancel: !!st.autoCancel, requireReschedule: !!st.requireReschedule, building: text(st.building), floor: text(st.floor), room: text(st.room), meetingLink: link },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
