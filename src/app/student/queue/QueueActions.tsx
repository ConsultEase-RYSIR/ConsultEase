"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const r = useRouter();
  useEffect(() => { const t = setInterval(() => r.refresh(), seconds * 1000); return () => clearInterval(t); }, [r, seconds]);
  return null;
}

async function post(url: string, body?: object) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return res.ok ? "" : ((await res.json().catch(() => ({}))).error as string) ?? "Something went wrong. Try again.";
}

export function CancelControls({ id, pending }: { id: string; pending?: boolean }) {
  const r = useRouter();
  const [ask, setAsk] = useState<null | "cancel" | "reschedule">(null), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  async function go(reschedule: boolean) {
    setBusy(true); setErr("");
    const e = await post(`/api/student/appointments/${id}/cancel`, { reschedule });
    if (e) { setErr(e); setBusy(false); return; }
    r.push(reschedule ? "/student/request" : "/student/dashboard"); r.refresh();
  }
  if (ask)
    return (
      <div id="cancel" className="mt-5 rounded-xl bg-red-50 p-4 text-sm">
        <p className="text-red-800">{ask === "reschedule" ? "Rescheduling cancels this slot so another student can take it. You'll pick a new time next." : "Cancel this appointment? Your slot is released and your professor is notified."}</p>
        {err && <p role="alert" className="mt-2 font-semibold text-red-700">{err}</p>}
        <div className="mt-3 flex gap-3">
          <button disabled={busy} onClick={() => go(ask === "reschedule")} className="btn !bg-red-700">{busy ? "Working…" : ask === "reschedule" ? "Cancel and pick a new time" : "Yes, cancel"}</button>
          <button disabled={busy} onClick={() => setAsk(null)} className="btn-ghost">Keep appointment</button>
        </div>
      </div>);
  return (
    <div id="cancel" className="mt-5 flex flex-wrap items-center gap-3">
      <a href="/student/dashboard" className="btn-ghost">Back to dashboard</a>
      {!pending && <button onClick={() => setAsk("reschedule")} className="btn-ghost">Reschedule</button>}
      <button onClick={() => setAsk("cancel")} className="px-3 text-sm font-semibold text-red-700">{pending ? "Cancel request" : "Cancel appointment"}</button>
    </div>);
}

export function OnlineCheckIn({ id, opensAt, closesAt, opensLabel }: { id: string; opensAt: string; closesAt: string; opensLabel: string }) {
  const r = useRouter();
  const [now, setNow] = useState(() => Date.now()), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  const early = now < Date.parse(opensAt), closed = now > Date.parse(closesAt);
  async function go() { setBusy(true); setErr(""); const e = await post(`/api/student/appointments/${id}/checkin`); setBusy(false); if (e) setErr(e); else r.refresh(); }
  return (
    <div>
      <button onClick={go} disabled={early || closed || busy} className={`w-full rounded-xl px-4 py-3 text-sm font-semibold ${early || closed ? "cursor-not-allowed bg-slate-300 text-slate-700" : "bg-brand text-white hover:opacity-90"}`}>
        {closed ? "Check-in closed" : early ? `Check in & join · opens ${opensLabel}` : busy ? "Checking in…" : "Check in & join"}
      </button>
      {err && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{err}</p>}
    </div>);
}
