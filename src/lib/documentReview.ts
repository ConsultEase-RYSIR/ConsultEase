import type { Check } from "./documentsRules";

export const pagesFromChecks = (checks: Check[]) => {
  for (const c of checks) { const m = /^(\d+) pages? found$/.exec(c.label); if (m) return Number(m[1]); }
  return 0;
};

type D = { requirement: string; required: boolean; status: string; storageKey: string | null };
// One line for the pre-check list: which required files are attached and which are still missing.
export function checklist(docs: D[]): Check {
  const req = docs.filter((d) => d.required);
  if (!req.length) return { ok: true, label: "No required files for this consultation" };
  const have = req.filter((d) => d.storageKey && d.status !== "MISSING"), miss = req.filter((d) => !have.includes(d));
  if (!miss.length) return { ok: true, label: "Required checklist: all required files attached" };
  return { ok: false, label: `Required checklist: ${have.length ? `${have.map((d) => d.requirement).join(", ")} attached, ` : ""}${miss.map((d) => d.requirement).join(", ")} still missing` };
}

// Returns an error message, or null when the review action is allowed.
export function checkReview(action: string, comment: string, status: string): string | null {
  if (comment.length > 1000) return "Keep the comment under 1,000 characters.";
  if (action === "reviewed") return ["SUBMITTED", "UNDER_REVIEW", "NEEDS_FIX"].includes(status) ? null : "This file can't be marked as reviewed.";
  if (action === "revise") {
    if (!["SUBMITTED", "UNDER_REVIEW", "REVIEWED"].includes(status)) return "A revision can't be requested for this file.";
    return comment ? null : "Add a comment so the student knows what to change.";
  }
  return "Unknown action.";
}
