// Pure helpers for the notifications page and its API. No database or Next.js imports.
export const PAGE_SIZE = 20;
const TZ = "Asia/Manila";

/** Only same-site paths are ever linked. Anything else renders as plain text. */
export function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const h = href.trim();
  return h.startsWith("/") && !h.startsWith("//") && !h.includes("\\") && !/[\u0000-\u001f]/.test(h) ? h : null;
}

const dayKey = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
};
/** Today / Yesterday / Earlier, by the Manila calendar day. */
export function groupLabel(d: Date, now = new Date()): "Today" | "Yesterday" | "Earlier" {
  const k = dayKey(d);
  if (k === dayKey(now)) return "Today";
  if (k === dayKey(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return "Earlier";
}

/** ?p=2 → 2. Anything missing, non-numeric, below 1 or absurdly large falls back to a safe value. */
export function parsePage(v: unknown): number {
  const n = typeof v === "string" && /^\d{1,4}$/.test(v) ? parseInt(v, 10) : 1;
  return n >= 1 ? n : 1;
}

export type ReadRequest = { all: true } | { id: string };
export function parseReadRequest(raw: any): ReadRequest | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.all === true) return { all: true };
  if (typeof raw.id === "string" && raw.id.length > 0 && raw.id.length <= 40) return { id: raw.id };
  return null;
}

export function groupItems<T extends { createdAt: Date }>(items: T[], now = new Date()) {
  const order = ["Today", "Yesterday", "Earlier"] as const;
  return order.map((label) => ({ label, items: items.filter((i) => groupLabel(i.createdAt, now) === label) })).filter((g) => g.items.length);
}
