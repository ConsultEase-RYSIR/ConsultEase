// Pure rules for the professor Notes & summaries page. No database or Next.js imports,
// so the same code runs in the browser, in API routes and in tests.
export const TZ = "Asia/Manila";
export const LIMITS = { notes: 10_000, concerns: 1_000, feedback: 3_000, revisionText: 300, revisions: 20 } as const;

// Notes can be taken during or after a consultation. Sending needs it to be completed.
export const canWriteNotes = (status: string) => status === "IN_CONSULTATION" || status === "COMPLETED";
export const canSendSummary = (status: string) => status === "COMPLETED";

/** YYYY-MM-DD for the Manila calendar day of a date. */
export function dayKey(d: Date): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}
/** Due dates are stored at noon Manila time so the right day shows in any timezone. */
export function dueToDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00+08:00`);
  return Number.isNaN(d.getTime()) || dayKey(d) !== s ? null : d; // rejects 2026-02-31
}
export const dateToDue = (d: Date | null) => (d ? dayKey(d) : "");

export const revisionStats = (total: number, done: number) =>
  total === 0 ? "No revisions required" : `${total} revision${total === 1 ? "" : "s"} · ${done} completed`;

export type CleanSummary = { concerns: string; feedback: string; revisions: { id?: string; text: string; dueDate: Date | null }[] };
type Result = { ok: true; value: CleanSummary } | { ok: false; error: string };

export function validateSummary(raw: any, consultStart: Date, send: boolean, now = new Date()): Result {
  if (!raw || typeof raw.concerns !== "string" || typeof raw.feedback !== "string" || !Array.isArray(raw.revisions)) return { ok: false, error: "The summary is not in the expected format." };
  const concerns = raw.concerns.trim(), feedback = raw.feedback.trim();
  if (concerns.length > LIMITS.concerns) return { ok: false, error: `Concerns discussed can be up to ${LIMITS.concerns} characters.` };
  if (feedback.length > LIMITS.feedback) return { ok: false, error: `Academic feedback can be up to ${LIMITS.feedback} characters.` };
  if (raw.revisions.length > LIMITS.revisions * 2) return { ok: false, error: "Too many revisions." };

  const minDay = dayKey(consultStart), maxDay = dayKey(new Date(now.getTime() + 366 * 86_400_000));
  const revisions: CleanSummary["revisions"] = [], seen = new Set<string>();
  for (let i = 0; i < raw.revisions.length; i++) {
    const r = raw.revisions[i];
    if (!r || typeof r.text !== "string") return { ok: false, error: `Revision ${i + 1} is not valid.` };
    const text = r.text.trim();
    if (!text) continue; // blank rows are dropped, not an error
    if (text.length > LIMITS.revisionText) return { ok: false, error: `Revision ${i + 1} is longer than ${LIMITS.revisionText} characters.` };
    let id: string | undefined;
    if (r.id != null) {
      if (typeof r.id !== "string" || r.id.length > 40 || seen.has(r.id)) return { ok: false, error: `Revision ${i + 1} is not valid.` };
      id = r.id; seen.add(id);
    }
    let dueDate: Date | null = null;
    if (r.due != null && r.due !== "") {
      dueDate = typeof r.due === "string" ? dueToDate(r.due) : null;
      if (!dueDate) return { ok: false, error: `Revision ${i + 1} has an invalid due date.` };
      const k = dayKey(dueDate);
      if (k < minDay) return { ok: false, error: `Revision ${i + 1} is due before the consultation date.` };
      if (k > maxDay) return { ok: false, error: `Revision ${i + 1} is due more than a year away.` };
    }
    revisions.push({ id, text, dueDate });
  }
  if (revisions.length > LIMITS.revisions) return { ok: false, error: `Add up to ${LIMITS.revisions} revisions.` };
  if (send && !concerns && !feedback) return { ok: false, error: "Add the concerns discussed or some academic feedback before sending." };
  return { ok: true, value: { concerns, feedback, revisions } };
}

// ---- "Generate structured summary": simple local rules, no AI service involved ----
const ACTION = "add|rewrite|revise|reword|fix|include|remove|merge|justify|clarify|expand|cite|update|redo|rework|tighten|reduce|submit|prepare|bring|move|split|replace";
const IMPERATIVE = new RegExp(`^(please\\s+)?(${ACTION})\\b`, "i");
const MODAL = new RegExp(`\\b(should|must|need to|needs to|has to|have to)\\s+(${ACTION})\\b`, "i");
const SUBJECT = /^(.+?)\s+(is|are|was|were|needs?|looks?|seems?|should|must|has|have|lacks?|doesn't|does not)\b/i;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export function generateSummary(notes: string): { concerns: string; feedback: string; revisions: string[] } {
  const sentences = notes.replace(/[ \t]+/g, " ").split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim().replace(/[.!?]+$/, "")).filter(Boolean);
  const revisions: string[] = [], rest: string[] = [], subjects: string[] = [];
  for (const s of sentences) {
    if (IMPERATIVE.test(s) || MODAL.test(s)) { revisions.push(cap(s.replace(/^please\s+/i, "")).slice(0, LIMITS.revisionText)); continue; }
    rest.push(cap(s));
    const m = SUBJECT.exec(s);
    if (m && m[1].length <= 60 && !subjects.some((x) => x.toLowerCase() === m[1].toLowerCase())) subjects.push(m[1]);
  }
  const concerns = subjects.slice(0, 4).map((s, i) => (i === 0 ? cap(s) : lowerFirst(s))).join(", ");
  return { concerns: concerns ? concerns + "." : "", feedback: rest.length ? rest.join(". ") + "." : "", revisions };
}
