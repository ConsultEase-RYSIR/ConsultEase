export type ConcernKey = "THESIS" | "CAPSTONE" | "PAPER" | "ACADEMIC" | "OTHER";
export type PriorityKey = "HIGH" | "MODERATE" | "REGULAR";
export const CONCERNS: { value: ConcernKey; label: string }[] = [
  { value: "THESIS", label: "Thesis" }, { value: "CAPSTONE", label: "Capstone" }, { value: "PAPER", label: "Paper" },
  { value: "ACADEMIC", label: "Academic concern" }, { value: "OTHER", label: "Other" },
];

/** Red: deadline within 3 days. Yellow: within 10 days on thesis/capstone/paper. Otherwise green. */
export function suggestPriority(concern: ConcernKey, deadline?: string | null, now = new Date()): PriorityKey {
  if (!deadline) return "REGULAR";
  const days = (new Date(`${deadline}T23:59:59+08:00`).getTime() - now.getTime()) / 86_400_000;
  if (days <= 3) return "HIGH";
  if (days <= 10 && ["THESIS", "CAPSTONE", "PAPER"].includes(concern)) return "MODERATE";
  return "REGULAR";
}

export const REQUIRED_DOCS: Record<ConcernKey, { name: string; required: boolean }[]> = {
  THESIS: [{ name: "Chapter draft (PDF)", required: true }, { name: "Consultation form", required: true }, { name: "Previous revision notes", required: false }],
  CAPSTONE: [{ name: "Project progress document (PDF)", required: true }, { name: "Consultation form", required: true }, { name: "Previous revision notes", required: false }],
  PAPER: [{ name: "Paper draft (PDF or DOCX)", required: true }, { name: "Consultation form", required: true }, { name: "Previous revision notes", required: false }],
  ACADEMIC: [{ name: "Consultation form", required: false }],
  OTHER: [{ name: "Consultation form", required: false }],
};
