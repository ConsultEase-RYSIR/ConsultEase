"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RevisionCheck({ id, text, due, overdue, done: initial }: { id: string; text: string; due: string; overdue: boolean; done: boolean }) {
  const [done, setDone] = useState(initial), [err, setErr] = useState("");
  async function toggle(v: boolean) {
    setDone(v); setErr("");
    const res = await fetch(`/api/student/revisions/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: v }) });
    if (!res.ok) { setDone(!v); setErr("Couldn't save that. Try again."); }
  }
  return (
    <li className="rounded-xl bg-canvas px-4 py-3">
      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" checked={done} onChange={(e) => toggle(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#0b5c7a]" />
        <span className={`flex-1 ${done ? "text-slate-500 line-through" : ""}`}>{text}</span>
        {due && <b className={`shrink-0 ${overdue && !done ? "text-red-700" : ""}`}>{overdue && !done ? "Overdue · " : ""}Due {due}</b>}
      </label>
      {err && <p role="alert" className="mt-1 text-xs font-semibold text-red-700">{err}</p>}
    </li>);
}

export function RatingForm({ apptId, rating: r0, comment: c0 }: { apptId: string; rating: number; comment: string }) {
  const router = useRouter(), [rating, setRating] = useState(r0), [hover, setHover] = useState(0), [comment, setComment] = useState(c0);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit() {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/student/appointments/${apptId}/evaluation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, comment }) });
    setBusy(false);
    if (res.ok) { setMsg({ ok: true, text: r0 ? "Evaluation updated." : "Thanks. Your evaluation was sent." }); router.refresh(); }
    else setMsg({ ok: false, text: ((await res.json().catch(() => ({}))).error as string) ?? "Something went wrong. Try again." });
  }
  return (
    <div>
      <div role="radiogroup" aria-label="Rating" className="mt-3 flex gap-3" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)}
            className={`text-4xl leading-none ${n <= (hover || rating) ? "text-amber-500" : "text-amber-300"}`}>{n <= (hover || rating) ? "★" : "☆"}</button>))}
      </div>
      <label htmlFor="eval-comment" className="mt-4 block text-sm font-semibold">Comments (optional)</label>
      <textarea id="eval-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={500} placeholder="What worked well, and what could be better?" className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-sm" />
      {msg && <p role="status" className={`mt-2 text-sm font-semibold ${msg.ok ? "text-green-800" : "text-red-700"}`}>{msg.text}</p>}
      <div className="mt-3 flex justify-end"><button onClick={submit} disabled={busy || !rating} className="btn disabled:opacity-50">{busy ? "Sending…" : r0 ? "Update evaluation" : "Submit evaluation"}</button></div>
    </div>);
}
