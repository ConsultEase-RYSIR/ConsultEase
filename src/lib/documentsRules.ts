// Client-safe rules for document uploads (no Node APIs here).
export const MAX_BYTES = 100 * 1024 * 1024;
export const ALLOWED = ["pdf", "docx"] as const;
export type Ext = (typeof ALLOWED)[number];

export function validateName(name: string, size: number): { ext: Ext } | { error: string } {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!(ALLOWED as readonly string[]).includes(ext)) return { error: "Upload a PDF or DOCX file." };
  if (size <= 0) return { error: "That file is empty." };
  if (size > MAX_BYTES) return { error: "That file is over the 100 MB limit." };
  return { ext: ext as Ext };
}
export const cleanName = (n: string) => n.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || "document";
export const formatSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export type Check = { ok: boolean; label: string };
