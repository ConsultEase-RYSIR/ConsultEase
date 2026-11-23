const tz = "Asia/Manila";
export const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
export const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
export const fmtRange = (a: Date, b: Date) => `${fmtTime(a).replace(" PM", "").replace(" AM", "")} – ${fmtTime(b)}`;
export const ago = (d: Date) => { const m = Math.round((Date.now() - d.getTime()) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : "Yesterday"; };
export const AVG_CONSULT_MIN = 12.5;
export const estimateWait = (ahead: number) => Math.round(Math.max(0, ahead) * AVG_CONSULT_MIN);
export const PRIORITY = {
  HIGH: { label: "Red · High", cls: "bg-red-50 text-red-700", dot: "bg-red-600" },
  MODERATE: { label: "Yellow · Moderate", cls: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  REGULAR: { label: "Green · Regular", cls: "bg-green-50 text-green-800", dot: "bg-green-600" },
} as const;
