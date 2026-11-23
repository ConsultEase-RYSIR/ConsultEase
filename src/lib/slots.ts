import { prisma } from "./prisma";
const OFFSET = "+08:00"; // Asia/Manila has no daylight saving

export const manilaDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); // YYYY-MM-DD
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00${OFFSET}`).getUTCDay();

export function slotTimes(date: string, startMin: number, endMin: number, durationMin: number) {
  const base = new Date(`${date}T00:00:00${OFFSET}`).getTime(), out: Date[] = [];
  for (let m = startMin; m + durationMin <= endMin; m += durationMin) out.push(new Date(base + m * 60_000));
  return out;
}
export const slotKey = (professorId: string, d: Date) => `${professorId}:${d.toISOString()}`;

/** Professor + the enabled working day for a date + its slot start times. */
export async function dayFor(professorId: string, date: string) {
  const prof = await prisma.user.findFirst({ where: { id: professorId, role: "PROFESSOR" }, include: { settings: true, availability: true } });
  const day = prof?.availability.find((a) => a.weekday === weekdayOf(date) && a.enabled);
  if (!prof || !prof.settings || !day) return null;
  return { prof, settings: prof.settings, day, times: slotTimes(date, day.startMin, day.endMin, prof.settings.durationMin) };
}
