"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const r = useRouter();
  useEffect(() => { const t = setInterval(() => r.refresh(), seconds * 1000); return () => clearInterval(t); }, [r, seconds]);
  return null;
}

export function Countdown({ to }: { to: string }) {
  const r = useRouter(), left = () => Math.max(0, Math.ceil((Date.parse(to) - Date.now()) / 1000));
  const [s, setS] = useState(left);
  useEffect(() => { const t = setInterval(() => { const l = left(); setS(l); if (!l) { clearInterval(t); r.refresh(); } }, 1000); return () => clearInterval(t); }, [to]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span suppressHydrationWarning>{String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>;
}

export function RowAction({ id, action, label, style, disabled }: { id: string; action: "call" | "complete" | "override"; label: string; style: "solid" | "outline" | "danger"; disabled?: boolean }) {
  const r = useRouter(), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/professor/appointments/${id}/queue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? "Something went wrong. Try again.");
    setBusy(false); r.refresh();
  }
  const cls = style === "solid" ? "bg-brand text-white" : style === "danger" ? "border border-red-700 bg-white text-red-700" : "border border-brand bg-white text-brand";
  return (
    <>
      <button onClick={go} disabled={busy || disabled} className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}>{busy ? "Working…" : label}</button>
      {err && <p role="alert" className="basis-full text-sm font-semibold text-red-700">{err}</p>}
    </>);
}

export function CancelRow({ id, name }: { id: string; name: string }) {
  const r = useRouter(), [ask, setAsk] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/professor/appointments/${id}/queue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Something went wrong. Try again."); setBusy(false); return; }
    r.refresh();
  }
  if (ask)
    return (
      <div className="basis-full rounded-xl bg-red-50 p-3 text-sm">
        <p className="text-red-800">Cancel {name}&apos;s consultation? The slot is released and the student is notified.</p>
        {err && <p role="alert" className="mt-2 font-semibold text-red-700">{err}</p>}
        <div className="mt-2 flex gap-3">
          <button disabled={busy} onClick={go} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Working…" : "Yes, cancel"}</button>
          <button disabled={busy} onClick={() => setAsk(false)} className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold">Keep</button>
        </div>
      </div>);
  return <button onClick={() => setAsk(true)} className="px-2 text-sm font-semibold text-red-700">Cancel</button>;
}

export function Verify() {
  const r = useRouter(), video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), timer = useRef(0), lock = useRef(false);
  const [on, setOn] = useState(false), [code, setCode] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const stop = useCallback(() => { clearInterval(timer.current); stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setOn(false); }, []);
  useEffect(() => stop, [stop]);

  async function submit(c: string) {
    if (lock.current || !c.trim()) return;
    lock.current = true; setBusy(true);
    const res = await fetch("/api/professor/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: c }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setMsg({ ok: true, text: `${j.student} checked in · queue #${j.queueNumber ?? "–"}` }); setCode(""); stop(); r.refresh(); lock.current = false; }
    else { setMsg({ ok: false, text: j.error ?? "Couldn't verify that code." }); setTimeout(() => { lock.current = false; }, 2000); }
  }
  async function start() {
    setMsg(null);
    try { stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); setOn(true); }
    catch { setMsg({ ok: false, text: "Camera unavailable. Allow camera access, or enter the code below." }); }
  }
  useEffect(() => {
    if (!on || !video.current) return;
    const v = video.current, c = document.createElement("canvas"), ctx = c.getContext("2d", { willReadFrequently: true })!;
    v.srcObject = stream.current; v.play().catch(() => {});
    let jsQR: any; import("jsqr").then((m) => { jsQR = m.default; });
    timer.current = window.setInterval(() => {
      if (!jsQR || !v.videoWidth) return;
      c.width = v.videoWidth; c.height = v.videoHeight; ctx.drawImage(v, 0, 0);
      const q = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      if (q?.data) submit(q.data);
    }, 300);
    return () => clearInterval(timer.current);
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps

  const corner = "absolute h-7 w-7 border-[#6ccbe8]";
  return (
    <div>
      <div className="relative grid h-[170px] place-items-center overflow-hidden rounded-2xl bg-ink">
        <video ref={video} muted playsInline className={`absolute inset-0 h-full w-full object-cover ${on ? "" : "hidden"}`} />
        <div className="relative h-[84px] w-[84px]"><i className={`${corner} left-0 top-0 rounded-tl-md border-l-4 border-t-4`} /><i className={`${corner} right-0 top-0 rounded-tr-md border-r-4 border-t-4`} /><i className={`${corner} bottom-0 left-0 rounded-bl-md border-b-4 border-l-4`} /><i className={`${corner} bottom-0 right-0 rounded-br-md border-b-4 border-r-4`} /><i className="absolute left-0 right-0 top-1/2 h-0.5 bg-amber-400" /></div>
      </div>
      <button onClick={on ? stop : start} className="btn mt-3 w-full">{on ? "Stop scanning" : "Scan student QR"}</button>
      <form onSubmit={(e) => { e.preventDefault(); submit(code); }} className="mt-4">
        <label htmlFor="code" className="text-sm font-medium">Or enter the code manually</label>
        <div className="mt-1 flex gap-2">
          <input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code shown under the QR" autoComplete="off" className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2.5 text-sm uppercase placeholder:normal-case" />
          <button disabled={busy || !code.trim()} className="btn-ghost disabled:opacity-50">{busy ? "…" : "Verify"}</button>
        </div>
      </form>
      {msg && <p role="status" className={`mt-3 rounded-xl p-3 text-sm font-semibold ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
    </div>);
}