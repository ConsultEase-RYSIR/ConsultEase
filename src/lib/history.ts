export const FILTERS = [["all", "All"], ["thesis", "Thesis"], ["capstone", "Capstone"], ["papers", "Papers"]] as const;
export const CONCERN_OF: Record<string, string> = { thesis: "THESIS", capstone: "CAPSTONE", papers: "PAPER" };

export const fmtLong = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

export function revisionText(count: number, sent: boolean) {
  if (!sent) return "feedback pending";
  return count ? `${count} revision${count === 1 ? "" : "s"} required` : "no revisions";
}

export function validateEvaluation(rating: unknown, comment: unknown): { rating: number; comment: string } | { error: string } {
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) return { error: "Choose a rating from 1 to 5 stars." };
  const c = String(comment ?? "").trim();
  if (c.length > 500) return { error: "Keep the comment under 500 characters." };
  return { rating: r, comment: c };
}
