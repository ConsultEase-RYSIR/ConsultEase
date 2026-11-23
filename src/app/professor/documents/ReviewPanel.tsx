"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(id: string, body: object) {
  const res = await fetch(`/api/professor/documents/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.ok ? "" : ((await res.json().catch(() => ({}))).error as string) ?? "Something went wrong. Try again.";
}

export function ReviewPanel({ id, status, initial, tab }: { id: string; status: string; initial: string; tab: string }) {
  const r = useRouter(), [text, setText] = useState(initial), [busy, setBusy] = useState(""), [err, setErr] = useState("");
  async function go(action: "reviewed" | "revise") {
    if (action === "revise" && !text.trim()) { setErr("Add a comment so the student knows what to change."); return; }
    setBusy(action); setErr("");
    const e = await post(id, { action, comment: text });
    if (e) { setErr(e); setBusy(""); return; }
    r.replace(`/professor/documents?tab=${tab}`); r.refresh();
  }
  return (
    <div>
      {status === "NEEDS_FIX" && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Revision requested. Waiting for the student to upload a new file.</p>}
      {status === "REVIEWED" && <p className="mb-3 rounded-xl bg-green-50 p-3 text-sm text-green-800">You marked this file as reviewed.</p>}
      <label htmlFor="comment" className="font-bold">Comment for the student</label>
      <textarea id="comment" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1000} placeholder="What should the student keep, fix or bring to the consultation?" className="mt-2 w-full rounded-xl border border-gray-300 p-3 text-sm" />
      {err && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{err}</p>}
      <div className="mt-3 flex justify-end gap-3">
        {status !== "NEEDS_FIX" && <button onClick={() => go("revise")} disabled={!!busy} className="btn-ghost disabled:opacity-50">{busy === "revise" ? "Sending…" : "Request revision"}</button>}
        {status !== "REVIEWED" && <button onClick={() => go("reviewed")} disabled={!!busy} className="btn disabled:opacity-50">{busy === "reviewed" ? "Saving…" : "Mark as reviewed"}</button>}
      </div>
    </div>);
}

export function RemindButton({ id, sent }: { id: string; sent: boolean }) {
  const r = useRouter(), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  async function go() { setBusy(true); setErr(""); const e = await post(id, { action: "remind" }); setBusy(false); if (e) setErr(e); else r.refresh(); }
  return (
    <div>
      <button onClick={go} disabled={busy || sent} className="btn disabled:opacity-50">{sent ? "Reminder sent" : busy ? "Sending…" : "Send reminder"}</button>
      {err && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{err}</p>}
    </div>);
}
