"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtMin } from "@/lib/availability";
import { CONCERNS, REQUIRED_DOCS, suggestPriority, ConcernKey } from "@/lib/priority";

type Prof = { id: string; name: string; settings: { durationMin: number; graceMin: number; building: string; floor: string; room: string }; availability: { weekday: number; startMin: number; endMin: number; faceToFace: boolean; online: boolean }[] };
type Slot = { startsAt: string; status: "open" | "booked" | "past" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const range = (a: number, b: number) => `${fmtMin(a)} – ${fmtMin(b)}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
const PRI = { HIGH: ["Red · High", "bg-red-50 text-red-700", "bg-red-600"], MODERATE: ["Yellow · Moderate", "bg-amber-100 text-amber-900", "bg-amber-500"], REGULAR: ["Green · Regular", "bg-green-50 text-green-800", "bg-green-600"] } as const;
const field = "mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-normal";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

export default function RequestConsultation() {
  const router = useRouter();
  const [profs, setProfs] = useState<Prof[]>([]);
  const [pid, setPid] = useState(""), [date, setDate] = useState(""), [slot, setSlot] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]), [modes, setModes] = useState<{ faceToFace: boolean; online: boolean } | null>(null);
  const [mode, setMode] = useState("FACE_TO_FACE"), [concern, setConcern] = useState<ConcernKey>("THESIS"), [deadline, setDeadline] = useState(""), [desc, setDesc] = useState("");
  const [error, setError] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/professors").then((r) => r.json()).then((d) => setProfs(d.professors ?? [])); }, []);
  useEffect(() => {
    setSlot(""); setSlots([]); setModes(null);
    if (!pid || !date) return;
    fetch(`/api/slots?professorId=${pid}&date=${date}`).then((r) => r.json()).then((d) => { setSlots(d.slots ?? []); setModes(d.modes); if (d.modes && !d.modes.faceToFace) setMode("ONLINE"); else if (d.modes && !d.modes.online) setMode("FACE_TO_FACE"); });
  }, [pid, date]);

  const prof = profs.find((p) => p.id === pid);
  const priority = useMemo(() => suggestPriority(concern, deadline || null), [concern, deadline]);
  const chosen = slots.find((s) => s.startsAt === slot);
  const [pl, pc, pd] = PRI[priority];

  async function send(url: string, body: object) {
    setBusy(true); setError(""); setNote("");
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false); const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? "Something went wrong. Try again."); if (res.status === 409) setDate((x) => x + ""); return false; }
    return true;
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slot || chosen?.status !== "open") return setError("Pick an open time slot first.");
    if (await send("/api/appointments", { professorId: pid, startsAt: slot, mode, concern, deadline, description: desc })) { router.push("/student/dashboard"); router.refresh(); }
  }
  const reset = () => { setPid(""); setDate(""); setSlot(""); setDeadline(""); setDesc(""); setConcern("THESIS"); setError(""); setNote(""); };

  return (
    <div>
      <h1 className="text-3xl font-bold">Request a consultation</h1>
      <p className="mt-1 text-muted">Choose a professor, pick an open slot and tell us what you need to discuss.</p>
      <div className="mt-6 grid grid-cols-[1fr_340px] gap-6">
        <form onSubmit={submit} className="card !p-6">
          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm font-semibold">Professor
              <select value={pid} onChange={(e) => setPid(e.target.value)} required className={field}><option value="">Select a professor</option>{profs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="text-sm font-semibold">Date
              <input type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} required className={field} /></label>
          </div>

          <p className="mt-5 text-sm font-semibold">Open time slots {prof && `(${prof.settings.durationMin} min each)`}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {slots.map((s) => (
              <button type="button" key={s.startsAt} disabled={s.status === "past"} onClick={() => setSlot(s.startsAt)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${slot === s.startsAt ? "border-2 border-brand bg-tint text-brand" : s.status === "open" ? "border-gray-300 bg-white" : "border-dashed border-gray-300 bg-gray-100 text-gray-400"} ${s.status === "past" ? "cursor-not-allowed" : ""}`}>
                {time(s.startsAt)}{s.status === "booked" && " · Booked"}{s.status === "past" && " · Passed"}</button>))}
            {!slots.length && <p className="text-sm text-muted">{pid && date ? "This professor has no open schedule on that date." : "Select a professor and date to see open slots."}</p>}
          </div>
          {chosen?.status === "booked" && (
            <div className="mt-4 rounded-xl bg-canvas p-4 text-sm">Slot full? Join the waitlist for {time(chosen.startsAt)} and we will notify you if it opens.
              <button type="button" disabled={busy} onClick={async () => { if (await send("/api/waitlist", { professorId: pid, startsAt: slot })) setNote("You're on the waitlist. We'll notify you if the slot opens."); }} className="btn-ghost mt-3 block !py-2 !text-brand">Join waitlist</button></div>)}

          <p className="mt-6 text-sm font-semibold">Consultation mode</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {[["FACE_TO_FACE", "Face-to-face", modes?.faceToFace ?? true], ["ONLINE", "Online", modes?.online ?? true]].map(([v, l, on]) => (
              <label key={String(v)} className={`flex items-center gap-3 rounded-xl border-2 p-3.5 font-semibold ${mode === v ? "border-brand bg-tint" : "border-line"} ${on ? "" : "opacity-40"}`}>
                <input type="radio" name="mode" disabled={!on} checked={mode === v} onChange={() => setMode(String(v))} />{l}</label>))}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <label className="text-sm font-semibold">Concern type
              <select value={concern} onChange={(e) => setConcern(e.target.value as ConcernKey)} className={field}>{CONCERNS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
            <label className="text-sm font-semibold">Related deadline
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={field} /></label>
          </div>
          <label className="mt-5 block text-sm font-semibold">What would you like to discuss?
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} required rows={4} className={field} /></label>

          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {note && <p className="mt-4 rounded-lg bg-tint p-3 text-sm text-brand">{note}</p>}
          <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={reset} className="btn-ghost">Cancel</button><button disabled={busy} className="btn disabled:opacity-60">{busy ? "Sending…" : "Send request"}</button></div>
        </form>

        <aside className="space-y-5">
          <section className="card"><h2 className="text-lg font-bold">Suggested priority</h2>
            <span className={`mt-3 inline-block rounded-full px-3.5 py-1.5 text-sm font-bold ${pc}`}><i className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${pd}`} />{pl}</span>
            <p className="mt-3 text-sm text-slate-600">Based on your concern type and deadline. Your professor will verify this before approving.</p>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-600">{Object.values(PRI).map(([l, , d], i) => <li key={l}><i className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${d}`} />{l}{i === 0 && ": urgent, near deadline"}</li>)}</ul></section>
          {prof && <section className="card"><h2 className="text-lg font-bold">{prof.name}</h2>
            <dl className="mt-3 space-y-2 text-sm [&>div]:flex [&>div]:justify-between [&_dt]:text-muted [&_dd]:font-semibold">
              <div><dt>Availability</dt><dd>{prof.availability.map((a) => DAYS[a.weekday]).join(", ")} · {range(prof.availability[0].startMin, prof.availability[0].endMin)}</dd></div>
              <div><dt>Slot length</dt><dd>{prof.settings.durationMin} minutes</dd></div>
              <div><dt>Check-in grace</dt><dd>{prof.settings.graceMin} minutes</dd></div>
              <div><dt>Location</dt><dd className="text-right">{prof.settings.building}, {prof.settings.floor}, Room {prof.settings.room}</dd></div></dl></section>}
          <section className="card"><h2 className="text-lg font-bold">Required for {CONCERNS.find((c) => c.value === concern)!.label.toLowerCase()} consults</h2>
            <ul className="mt-3 space-y-2 text-sm">{REQUIRED_DOCS[concern].map((d) => <li key={d.name} className="flex items-center gap-2.5"><span className="h-5 w-5 rounded border border-gray-300" />{d.name}{!d.required && <span className="text-muted"> (optional)</span>}</li>)}</ul>
            <p className="mt-3 text-xs text-muted">You can upload these after sending the request, on the Documents page.</p></section>
        </aside>
      </div>
    </div>
  );
}