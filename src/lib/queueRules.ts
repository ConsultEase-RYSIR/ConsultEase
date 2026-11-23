// Pure rules for the queue and check-in pages. No database access, so they are easy to test.
export const ONLINE_OPEN_MIN = 10; // online check-in opens this long before the start
export const QR_EARLY_MIN = 30;    // a professor may verify a QR code this long before the start

export function checkInWindow(startsAt: Date, graceMin: number, online: boolean) {
  const t = startsAt.getTime();
  return { opensAt: new Date(t - (online ? ONLINE_OPEN_MIN : QR_EARLY_MIN) * 60000), closesAt: new Date(t + graceMin * 60000) };
}

export type Step = { label: string; state: "done" | "current" | "todo" };
export function progressSteps(status: string, online: boolean): Step[] {
  const labels = online ? ["Approved", "Waiting for check-in", "Checked in", "In consultation"] : ["Approved", "QR issued", "Waiting for check-in", "Checked in", "In consultation"];
  const current = status === "IN_CONSULTATION" ? labels.length - 1 : status === "CHECKED_IN" ? labels.length - 2 : labels.length - 3;
  return labels.map((label, i) => ({ label, state: i < current ? "done" : i === current ? "current" : "todo" }));
}

export const manualCode = (token: string) => token.slice(0, 8).toUpperCase();

export const fmtOpens = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

export type RowState = "serving" | "ready" | "waiting" | "late" | "noshow";
// How a professor's queue card looks: late = approved, start time passed, not checked in yet.
export function rowState(status: string, startsAt: Date, now: Date): RowState {
  if (status === "IN_CONSULTATION") return "serving";
  if (status === "CHECKED_IN") return "ready";
  if (status === "NO_SHOW") return "noshow";
  return now >= startsAt ? "late" : "waiting";
}
export const cap = (s: string) => s[0] + s.slice(1).toLowerCase();
