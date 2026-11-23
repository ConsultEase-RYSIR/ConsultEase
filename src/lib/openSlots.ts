import { prisma } from "./prisma";
import { generateSlots, manilaParts } from "./availability";
import { fmtDay, fmtTime } from "./format";

export const BLOCKING = ["PENDING", "APPROVED", "WAITING", "CHECKED_IN", "IN_CONSULTATION", "LATE"] as const;
/** The instant for `min` minutes after midnight (Manila) on a YYYY-MM-DD date. */
export const manilaAt = (dateKey: string, min = 0) => new Date(Date.parse(dateKey + "T00:00:00Z") + (min - 480) * 60000);

export type OpenSlot = { startsAt: string; endsAt: string; day: string; time: string };

/** Free future slots for a professor, from their weekly hours minus anything already holding the slot. */
export async function openSlots(professorId: string, mode: "FACE_TO_FACE" | "ONLINE", horizonDays = 21): Promise<OpenSlot[]> {
  const now = new Date();
  const [settings, days] = await Promise.all([
    prisma.professorSettings.findUnique({ where: { professorId } }),
    prisma.availabilityDay.findMany({ where: { professorId, enabled: true } }),
  ]);
  const dur = settings?.durationMin ?? 30;
  const taken = await prisma.appointment.findMany({
    where: { professorId, status: { in: [...BLOCKING] }, startsAt: { gte: now, lt: new Date(now.getTime() + (horizonDays + 1) * 86400000) } },
    select: { startsAt: true, endsAt: true },
  });
  const today = manilaParts(now);
  const out: OpenSlot[] = [];
  for (let i = 0; i <= horizonDays; i++) {
    const t = new Date(Date.parse(today.dateKey + "T00:00:00Z"));
    t.setUTCDate(t.getUTCDate() + i);
    const key = t.toISOString().slice(0, 10);
    const d = days.find((x) => x.weekday === t.getUTCDay());
    if (!d || (mode === "ONLINE" ? !d.online : !d.faceToFace)) continue;
    for (const s of generateSlots(d.startMin, d.endMin, dur)) {
      const start = manilaAt(key, s), end = manilaAt(key, s + dur);
      if (start <= now || taken.some((a) => a.startsAt < end && a.endsAt > start)) continue;
      out.push({ startsAt: start.toISOString(), endsAt: end.toISOString(), day: fmtDay(start), time: fmtTime(start) });
    }
  }
  return out;
}
