"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";

function Form() {
  const router = useRouter();
  const email = useSearchParams().get("email") ?? "";
  const [code, setCode] = useState(""), [error, setError] = useState(""), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [cooldown, setCooldown] = useState(60);

  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setNote(""); setBusy(true);
    const res = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code }) });
    setBusy(false);
    if (res.ok) return router.push("/login?verified=1");
    setError((await res.json()).error ?? "Something went wrong. Try again.");
  }
  async function resend() {
    setError(""); setNote("");
    const res = await fetch("/api/auth/resend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    if (res.ok) { setNote("If this email needs verifying, a new code is on its way."); return setCooldown(60); }
    const d = await res.json(); setError(d.error ?? "Couldn't send the code. Try again."); if (d.retryAfterSec) setCooldown(d.retryAfterSec);
  }

  return (
    <form onSubmit={submit} className="w-full max-w-[470px] rounded-3xl border border-line bg-white p-9">
      <h2 className="text-3xl font-bold">Check your email</h2>
      <p className="mt-1 text-muted">Enter the 6-digit code we sent to <b className="text-ink">{email || "your email"}</b>. It expires in 10 minutes.</p>
      <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required placeholder="000000" aria-label="Verification code"
        className="mt-6 w-full rounded-xl border border-gray-300 px-4 py-4 text-center text-3xl font-bold tracking-[0.5em]" />
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {note && <p className="mt-4 rounded-lg bg-tint p-3 text-sm text-brand">{note}</p>}
      <button disabled={busy || code.length !== 6} className="btn mt-6 w-full !py-3.5 text-base disabled:opacity-50">{busy ? "Verifying…" : "Verify email"}</button>
      <div className="mt-5 flex items-center justify-between text-sm">
        <button type="button" onClick={resend} disabled={cooldown > 0} className="font-semibold text-brand underline disabled:text-muted disabled:no-underline">{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</button>
        <Link href="/login" className="text-muted">Back to sign in</Link>
      </div>
    </form>
  );
}
export default function Verify() { return <AuthShell><Suspense><Form /></Suspense></AuthShell>; }
