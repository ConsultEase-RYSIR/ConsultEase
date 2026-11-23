// Pure helpers shared by the availability page (client) and its API route (server).
// All schedule math uses Asia/Manila (UTC+8, no daylight saving).
const OFFSET_MIN = 8 * 60;

export const DAYS = [
  { weekday: 1, name: "Monday" }, { weekday: 2, name: "Tuesday" }, { weekday: 3, name: "Wednesday" },
  { weekday: 4, name: "Thursday" }, { weekday: 5, name: "Friday" },
] as const;
export const dayName = (w: number) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][w];

export type DayInput = { weekday: number; enabled: boolean; startMin: number; endMin: number; faceToFace: boolean; online: boolean };
export type ApptLite = { id: string; studentName: string; weekday: number; startMin: number; endMin: number; mode: "FACE_TO_FACE" | "ONLINE"; dateKey: string };
export type Conflict = { weekday: number; apptId: string; message: string };

export const DURATIONS = [15, 20, 30, 45, 60];
export const GRACES = [5, 10, 15];

export function manilaParts(d: Date) {
  const s = new Date(d.getTime() + OFFSET_MIN * 60000);
  return { weekday: s.getUTCDay(), min: s.getUTCHours() * 60 + s.getUTCMinutes(), dateKey: s.toISOString().slice(0, 10) };
}

export function fmtMin(m: number) {
  const h = Math.floor(m / 60) % 24, mm = m % 60;           // 1440 (end of day) reads as 12:00 AM
  return `${h % 12 || 12}:${String(mm).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** Times offered in the pickers: the full 24 hours, 12:00 AM to 12:00 AM (midnight), every 30 minutes. */
export const TIME_OPTIONS = Array.from({ length: 49 }, (_, i) => i * 30);

/** Start minutes of every slot that fits fully inside the window. */
export function generateSlots(startMin: number, endMin: number, durationMin: number) {
  const out: number[] = [];
  for (let s = startMin; s + durationMin <= endMin; s += durationMin) out.push(s);
  return out;
}

/** Problem with one day's settings, or null when it is fine. */
export function dayError(d: DayInput, durationMin: number): string | null {
  if (!d.enabled) return null;
  if (d.endMin <= d.startMin) return "End time must be after the start time.";
  if (d.endMin - d.startMin < durationMin) return `The window is shorter than one ${durationMin}-minute slot.`;
  if (!d.faceToFace && !d.online) return "Choose at least one consultation mode.";
  return null;
}

/** Existing consultations that the proposed weekly hours would leave out. */
export function findConflicts(days: DayInput[], appts: ApptLite[]): Conflict[] {
  const out: Conflict[] = [];
  for (const a of appts) {
    const d = days.find((x) => x.weekday === a.weekday);
    const who = `${a.studentName}, ${fmtMin(a.startMin)}`;
    let message: string | null = null;
    if (!d || !d.enabled) message = `${dayName(a.weekday)} is switched off but has an existing consultation (${who}, ${a.dateKey}).`;
    else if (a.startMin < d.startMin || a.endMin > d.endMin)
      message = `${dayName(a.weekday)} ${fmtMin(d.startMin)} – ${fmtMin(d.endMin)} leaves out an existing consultation (${who}, ${a.dateKey}).`;
    else if ((a.mode === "ONLINE" && !d.online) || (a.mode === "FACE_TO_FACE" && !d.faceToFace))
      message = `${dayName(a.weekday)} no longer offers ${a.mode === "ONLINE" ? "online" : "face-to-face"} consultations, but ${who} booked one (${a.dateKey}).`;
    if (message) out.push({ weekday: a.weekday, apptId: a.id, message });
  }
  return out;
}

/** Date (YYYY-MM-DD, Manila) of the next time this weekday's window is still ahead. */
export function nextDateKey(weekday: number, todayKey: string, nowMin: number, endMin: number) {
  const t = new Date(todayKey + "T00:00:00Z");
  let delta = (weekday - t.getUTCDay() + 7) % 7;
  if (delta === 0 && nowMin >= endMin) delta = 7;
  t.setUTCDate(t.getUTCDate() + delta);
  return t.toISOString().slice(0, 10);
}
export const dateLabel = (key: string) =>
  new Date(key + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });