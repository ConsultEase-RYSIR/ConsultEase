"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRIORITY } from "@/lib/format";

type P = keyof typeof PRIORITY;
export type ReqRow = { id: string; student: string; concern: string; title: string; when: string; mode: string; priority: P; conflict: string | null };
type Slot = { startsAt: string; day: string; time: string };

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const SELECT = "rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

async function send(url: string, body: object) {
  try {
    const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? null : (data.error as string) ?? "Something went wrong. Try again.";
  } catch { return "We couldn't reach the server. Try again."; }
}

function RequestCard({ r, onDone }: { r: ReqRow; onDone: () => void }) {
  const [priority, setPriority] = useState<P>(r.priority);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [picked, setPicked] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const url = `/api/professor/requests/${r.id}`;

  async function act(body: object) {
    setBusy(true); setError("");
    const e = await send(url, body);
    setBusy(false);
    e ? setError(e) : onDone();
  }
  async function openReschedule() {
    setError(""); setLoadingSlots(true); setSlots([]);
    try { const res = await fetch(url); const d = await res.json(); setSlots(res.ok ? d.slots : []); if (!res.ok) setError(d.error); }
    catch { setError("We couldn't load open slots. Try again."); }
    setLoadingSlots(false);
  }
  const days = (slots ?? []).reduce<Record<string, Slot[]>>((m, s) => ((m[s.day] ??= []).push(s), m), {});
  const sug = PRIORITY[r.priority];

  return (
    <article className="rounded-2xl border border-line p-4">
      <h3 className="text-lg font-bold">{r.student}</h3>
      <p className="text-sm text-muted">{r.concern} · {r.title} · {r.when} · {r.mode}</p>
      <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${sug.cls}`}><i className={`h-2 w-2 rounded-full ${sug.dot}`} />Suggested: {sug.label}</span>
      {r.conflict && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">Conflict: {r.conflict}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <label className="text-sm font-semibold" htmlFor={`p-${r.id}`}>Priority</label>
        <select id={`p-${r.id}`} className={SELECT} value={priority} onChange={(e) => setPriority(e.target.value as P)}>
          {(Object.keys(PRIORITY) as P[]).map((k) => <option key={k} value={k}>{PRIORITY[k].label}</option>)}
        </select>
        {!r.conflict && <button disabled={busy} onClick={() => act({ action: "approve", priority })} className={`btn disabled:opacity-50 ${FOCUS}`}>Approve</button>}
        <button disabled={busy} onClick={slots ? () => { setSlots(null); setPicked(""); } : openReschedule} aria-expanded={!!slots}
          className={`inline-flex items-center rounded-xl border border-brand bg-white px-4 py-2.5 text-sm font-semibold text-brand disabled:opacity-50 ${FOCUS}`}>Reschedule</button>
        <button disabled={busy} onClick={() => { if (confirm(`Decline ${r.student}'s request? They will be notified.`)) act({ action: "decline" }); }}
          className={`px-2 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50 ${FOCUS}`}>Decline</button>
      </div>
      {slots && (
        <div className="mt-3 rounded-xl bg-gray-50 p-4">
          <p className="text-sm font-semibold">Move this request to an open {r.mode.toLowerCase()} slot</p>
          {loadingSlots ? <p className="mt-2 text-sm text-muted">Loading open slots…</p>
            : slots.length === 0 ? <p className="mt-2 text-sm text-muted">No open slots in the next 3 weeks. Add hours under Availability &amp; settings.</p> : (
              <div className="mt-2 max-h-56 space-y-3 overflow-y-auto">
                {Object.entries(days).map(([day, list]) => (
                  <div key={day}><p className="text-xs font-semibold text-muted">{day}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {list.map((s) => (
                        <button key={s.startsAt} onClick={() => setPicked(s.startsAt)} aria-pressed={picked === s.startsAt}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${FOCUS} ${picked === s.startsAt ? "border-brand bg-tint text-brand" : "border-gray-300 bg-white"}`}>{s.time}</button>))}
                    </div></div>))}
              </div>)}
          <div className="mt-3 flex gap-2">
            <button disabled={!picked || busy} onClick={() => act({ action: "reschedule", startsAt: picked })} className={`btn disabled:opacity-40 ${FOCUS}`}>Move request</button>
            <button onClick={() => { setSlots(null); setPicked(""); }} className={`btn-ghost ${FOCUS}`}>Cancel</button>
          </div>
        </div>)}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </article>
  );
}

export function PendingRequests({ rows }: { rows: ReqRow[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const live = rows.filter((r) => !gone.includes(r.id));
  const shown = all ? live : live.slice(0, 3);
  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">Pending requests</h2>
        <p className="text-sm text-muted">Confirm or change the suggested priority before approving</p>
      </div>
      {live.length === 0 ? (
        <p className="mt-4 rounded-xl bg-gray-50 px-4 py-6 text-sm text-muted">No pending requests. New student requests appear here as soon as they are sent.</p>
      ) : (
        <div className="mt-4 space-y-3">{shown.map((r) => <RequestCard key={r.id} r={r} onDone={() => { setGone((g) => [...g, r.id]); router.refresh(); }} />)}</div>)}
      {live.length > 3 && <button onClick={() => setAll(!all)} className={`mt-4 text-sm font-semibold text-brand underline ${FOCUS}`}>{all ? "Show fewer" : `View all ${live.length} requests`}</button>}
    </section>
  );
}

export function WaitlistReplacements({ rows }: { rows: { id: string; student: string; when: string }[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const live = rows.filter((r) => !gone.includes(r.id));
  async function act(id: string, action: "approve" | "skip") {
    setBusy(id); setError("");
    const e = await send(`/api/professor/waitlist/${id}`, { action });
    setBusy("");
    if (e) setError(e); else { setGone((g) => [...g, id]); router.refresh(); }
  }
  return (
    <section className="card">
      <h2 className="text-lg font-bold">Waitlist replacements</h2>
      {live.length === 0 ? <p className="mt-2 text-sm text-muted">No students are waiting for an opened slot.</p> : live.map((w) => (
        <div key={w.id} className="mt-3"><p className="text-sm"><b>{w.student}</b> for {w.when}</p>
          <div className="mt-2 flex gap-2">
            <button disabled={!!busy} onClick={() => act(w.id, "approve")} className={`btn disabled:opacity-50 ${FOCUS}`}>Approve</button>
            <button disabled={!!busy} onClick={() => act(w.id, "skip")} className={`btn-ghost disabled:opacity-50 ${FOCUS}`}>Skip</button>
          </div></div>))}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
