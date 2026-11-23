"use client";
import { useEffect, useRef, useState } from "react";
import { generateSummary, LIMITS } from "@/lib/notesRules";

type Rev = { key: string; id?: string; text: string; due: string; done: boolean };
type Props = {
  id: string; student: string; title: string; whenLabel: string; priority: { label: string; cls: string; dot: string };
  inConsultation: boolean; canSend: boolean;
  initial: { privateNotes: string; concerns: string; feedback: string; status: "DRAFT" | "SENT"; sentLabel: string | null; revisions: { id: string; text: string; due: string; done: boolean }[] };
};
const input = "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand";
const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

export default function NotesWorkspace(p: Props) {
  const n = useRef(0), nextKey = () => `n${++n.current}`;
  const toRow = (r: { id: string; text: string; due: string; done: boolean }): Rev => ({ key: r.id, ...r });

  // ---- private notes, autosaved ----
  const [notes, setNotes] = useState(p.initial.privateNotes);
  const [save, setSave] = useState<{ s: "idle" | "dirty" | "saving" | "saved" | "error"; at?: string; msg?: string }>({ s: "idle" });
  const notesRef = useRef(notes), lastSaved = useRef(p.initial.privateNotes), timer = useRef<ReturnType<typeof setTimeout>>();
  const putNotes = (value: string, keepalive = false) =>
    fetch(`/api/professor/notes/${p.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ privateNotes: value }), keepalive });
  async function saveNotes() {
    const value = notesRef.current;
    setSave((s) => ({ ...s, s: "saving" }));
    try {
      const r = await putNotes(value);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not save notes.");
      lastSaved.current = value;
      setSave(notesRef.current === value ? { s: "saved", at: time(new Date()) } : { s: "dirty" });
    } catch (e: any) { setSave({ s: "error", msg: e?.message ?? "Could not save notes." }); }
  }
  function onNotes(v: string) {
    setNotes(v); notesRef.current = v; setSave({ s: "dirty" });
    clearTimeout(timer.current); timer.current = setTimeout(saveNotes, 1000);
  }

  // ---- structured summary ----
  const [concerns, setConcerns] = useState(p.initial.concerns);
  const [feedback, setFeedback] = useState(p.initial.feedback);
  const [revs, setRevs] = useState<Rev[]>(p.initial.revisions.map(toRow));
  const [status, setStatus] = useState(p.initial.status);
  const [sentLabel, setSentLabel] = useState(p.initial.sentLabel);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sumDirty = useRef(false);
  const touch = () => { sumDirty.current = true; setMsg(null); };
  const sent = status === "SENT";

  // Flush unsaved notes when leaving, and warn before closing the tab with unsaved work.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (notesRef.current !== lastSaved.current || sumDirty.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn); clearTimeout(timer.current);
      if (notesRef.current !== lastSaved.current) putNotes(notesRef.current, true).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function generate() {
    if (!notes.trim()) { setMsg({ ok: false, text: "Write some consultation notes first." }); return; }
    const g = generateSummary(notes);
    if ((concerns.trim() || feedback.trim()) && !window.confirm("Replace the concerns and academic feedback with a new draft from your notes?")) return;
    setConcerns(g.concerns); setFeedback(g.feedback);
    const have = new Set(revs.map((r) => r.text.trim().toLowerCase()));
    const add = g.revisions.filter((t) => !have.has(t.toLowerCase())).slice(0, Math.max(0, LIMITS.revisions - revs.length));
    setRevs((r) => [...r, ...add.map((text) => ({ key: nextKey(), text, due: "", done: false }))]);
    sumDirty.current = true;
    setMsg({ ok: true, text: "Draft filled from your notes. Review and edit it before sending. Your private notes stay private, but anything copied into the draft is shared." });
  }

  async function submit(send: boolean) {
    if (send && !window.confirm(`${sent ? "Update" : "Send"} this summary for ${p.student}? Your private notes are not shared.`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/professor/notes/${p.id}/summary`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concerns, feedback, send, revisions: revs.map((x) => ({ id: x.id, text: x.text, due: x.due || null })) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ ok: false, text: j.error ?? "Something went wrong. Try again." }); return; }
      setConcerns(j.record.concerns); setFeedback(j.record.feedback); setRevs(j.record.revisions.map(toRow));
      setStatus(j.record.status);
      if (j.record.sentAt) setSentLabel(new Date(j.record.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Manila" }));
      sumDirty.current = false;
      setMsg({ ok: true, text: send ? (sent ? `Updated. ${p.student} was notified.` : `Sent. ${p.student} was notified.`) : "Draft saved." });
    } catch { setMsg({ ok: false, text: "Could not reach the server. Check your connection and try again." }); }
    finally { setBusy(false); }
  }

  const saveText = { idle: "Notes save automatically as you type.", dirty: "Unsaved changes…", saving: "Saving…", saved: `Autosaved ${save.at ?? ""}`, error: save.msg ?? "Could not save." }[save.s];

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-sm text-muted">{p.whenLabel}</p><h2 className="text-2xl font-bold">{p.student} · {p.title}</h2></div>
          <span className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${p.priority.cls}`}><i className={`h-2 w-2 rounded-full ${p.priority.dot}`} />{p.priority.label}</span>
        </div>
        {p.inConsultation && <p className="mt-3 rounded-xl bg-tint px-3 py-2 text-sm text-brand">Consultation in progress. You can take notes now; complete it from Queue &amp; attendance to send the summary.</p>}
        <label htmlFor="notes" className="mt-4 block text-sm font-semibold">Consultation notes (private)</label>
        <textarea id="notes" value={notes} maxLength={LIMITS.notes} onChange={(e) => onNotes(e.target.value)} rows={8} className={`${input} mt-1`} placeholder="What was discussed, observations, follow-ups. Only you can see this." />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className={`text-sm ${save.s === "error" ? "text-red-700" : "text-muted"}`} aria-live="polite">
            {saveText}{save.s === "error" && <button onClick={saveNotes} className="ml-2 font-semibold underline">Retry</button>}
          </p>
          <button type="button" onClick={generate} className="btn">Generate structured summary</button>
        </div>
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Summary draft</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${sent ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>{sent ? `Sent${sentLabel ? " " + sentLabel : ""}` : "Draft · not sent"}</span>
        </div>
        <label htmlFor="concerns" className="mt-4 block text-sm font-semibold">Concerns discussed</label>
        <textarea id="concerns" rows={2} maxLength={LIMITS.concerns} value={concerns} onChange={(e) => { setConcerns(e.target.value); touch(); }} className={`${input} mt-1`} />
        <label htmlFor="feedback" className="mt-4 block text-sm font-semibold">Academic feedback</label>
        <textarea id="feedback" rows={3} maxLength={LIMITS.feedback} value={feedback} onChange={(e) => { setFeedback(e.target.value); touch(); }} className={`${input} mt-1`} />

        <p className="mt-4 text-sm font-semibold">Required revisions</p>
        <ul className="mt-2 space-y-2">
          {revs.map((r, i) => (
            <li key={r.key} className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas p-2">
              <input aria-label={`Revision ${i + 1}`} value={r.text} maxLength={LIMITS.revisionText} placeholder="What needs to change" onChange={(e) => { setRevs(revs.map((x) => x.key === r.key ? { ...x, text: e.target.value } : x)); touch(); }} className={`${input} min-w-[12rem] flex-1`} />
              <input type="date" aria-label={`Due date for revision ${i + 1}`} value={r.due} onChange={(e) => { setRevs(revs.map((x) => x.key === r.key ? { ...x, due: e.target.value } : x)); touch(); }} className={`${input} w-40`} />
              {r.done && <span className="text-xs font-semibold text-green-800">✓ Done</span>}
              <button type="button" aria-label={`Remove revision ${i + 1}`} onClick={() => { setRevs(revs.filter((x) => x.key !== r.key)); touch(); }} className="px-2 text-sm text-red-700">Remove</button>
            </li>))}
        </ul>
        <button type="button" disabled={revs.length >= LIMITS.revisions} onClick={() => { setRevs([...revs, { key: nextKey(), text: "", due: "", done: false }]); touch(); }} className="mt-3 rounded-xl border border-dashed border-brand px-4 py-2 text-sm font-semibold text-brand disabled:opacity-50">Add revision</button>

        {msg && <p role="status" className={`mt-4 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          {!p.canSend && !sent && <span className="mr-auto text-sm text-muted">Sending opens once the consultation is completed.</span>}
          {!sent && <button type="button" disabled={busy} onClick={() => submit(false)} className="btn-ghost disabled:opacity-50">Save draft</button>}
          <button type="button" disabled={busy || !p.canSend} onClick={() => submit(true)} className="btn disabled:opacity-50">{sent ? "Update student's copy" : "Send to student"}</button>
        </div>
      </section>
    </div>
  );
}
