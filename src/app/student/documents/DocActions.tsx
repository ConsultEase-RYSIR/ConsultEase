"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { validateName } from "@/lib/documentsRules";

async function send(id: string, file: File) {
  const bad = validateName(file.name, file.size);
  if ("error" in bad) return bad.error;
  const body = new FormData(); body.append("file", file);
  const res = await fetch(`/api/student/documents/${id}/upload`, { method: "POST", body });
  return res.ok ? "" : ((await res.json().catch(() => ({}))).error as string) ?? "Upload failed. Try again.";
}
const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function UploadButton({ id, label }: { id: string; label: "Upload" | "Replace" }) {
  const r = useRouter(), ref = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  async function pick(f?: File) { if (!f) return; setBusy(true); setErr(""); const e = await send(id, f); setBusy(false); if (e) setErr(e); else r.refresh(); if (ref.current) ref.current.value = ""; }
  return (
    <div className="text-right">
      <input ref={ref} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
      <button onClick={() => ref.current?.click()} disabled={busy} className={label === "Replace" ? "text-sm font-semibold text-brand underline disabled:opacity-50" : "rounded-xl border border-brand bg-white px-4 py-1.5 text-sm font-semibold text-brand disabled:opacity-50"}>{busy ? "Uploading…" : label}</button>
      {err && <p role="alert" className="mt-1 max-w-[220px] text-xs font-semibold text-red-700">{err}</p>}
    </div>);
}

// Files fill the open requirements in order: first file to the first open one, and so on.
export function DropZone({ openIds }: { openIds: string[] }) {
  const r = useRouter(), ref = useRef<HTMLInputElement>(null), [over, setOver] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  async function run(files: File[]) {
    if (!files.length) return;
    if (!openIds.length) { setMsg("Every requirement has a file. Use Replace on a row to swap one."); return; }
    setBusy(true); setMsg("");
    const used = files.slice(0, openIds.length), errs: string[] = [];
    for (let i = 0; i < used.length; i++) { const e = await send(openIds[i], used[i]); if (e) errs.push(`${used[i].name}: ${e}`); }
    if (files.length > used.length) errs.push(`Only ${openIds.length} requirement${openIds.length === 1 ? " is" : "s are"} open, so ${files.length - used.length} file${files.length - used.length === 1 ? " was" : "s were"} skipped.`);
    setBusy(false); setMsg(errs.join(" ")); r.refresh();
  }
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); run(Array.from(e.dataTransfer.files)); }}
      className={`mt-5 rounded-2xl border-2 border-dashed p-8 text-center ${over ? "border-brand bg-tint" : "border-gray-300 bg-white"}`}>
      <svg aria-hidden className="mx-auto h-7 w-7 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
      <b className="mt-3 block">Drop files here to upload</b>
      <p className="mt-1 text-sm text-slate-600">Thesis, capstone, projects and academic papers · PDF or DOCX, up to 100 MB</p>
      <input ref={ref} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => { run(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      <button onClick={() => ref.current?.click()} disabled={busy} className="btn mt-4 !px-6 disabled:opacity-50">{busy ? "Uploading…" : "Choose files"}</button>
      {msg && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{msg}</p>}
    </div>);
}
