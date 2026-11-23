"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";

const input = "mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 font-normal";

function Form() {
  const router = useRouter();
  const [role, setRole] = useState<"STUDENT" | "PROFESSOR">(useSearchParams().get("role") === "PROFESSOR" ? "PROFESSOR" : "STUDENT");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")), password = String(f.get("password"));
    if (password !== f.get("confirm")) return setError("Passwords don't match.");
    setBusy(true);
    const res = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.get("name"), email, password, role }) });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error ?? "Something went wrong. Try again.");
    router.push(`/verify?email=${encodeURIComponent(email)}`);
  }

  return (
    <form onSubmit={submit} className="w-full max-w-[470px] rounded-3xl border border-line bg-white p-9">
      <h2 className="text-3xl font-bold">Create account</h2>
      <p className="mt-1 text-muted">We'll email you a code to verify it.</p>
      <div className="mt-6 grid grid-cols-2 gap-3" role="radiogroup">
        {(["STUDENT", "PROFESSOR"] as const).map((k) => (
          <button type="button" key={k} role="radio" aria-checked={role === k} onClick={() => setRole(k)}
            className={`rounded-xl border-2 p-3 font-semibold ${role === k ? "border-brand bg-tint" : "border-line"}`}>{k === "STUDENT" ? "Student" : "Professor"}</button>))}
      </div>
      <label className="mt-5 block text-sm font-semibold">Full name<input name="name" autoComplete="off" required placeholder="Enter your full name" className={input} /></label>
      <label className="mt-4 block text-sm font-semibold">{role === "STUDENT" ? "Student" : "Professor"} email<input name="email" type="email" autoComplete="off" required placeholder={role === "STUDENT" ? "name@student.university.edu" : "name@university.edu"} className={input} /></label>
      <label className="mt-4 block text-sm font-semibold">Password<input name="password" type="password" autoComplete="new-password" minLength={8} required placeholder="At least 8 characters" className={input} /></label>
      <label className="mt-4 block text-sm font-semibold">Confirm password<input name="confirm" type="password" autoComplete="new-password" required placeholder="Re-enter your password" className={input} /></label>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="btn mt-6 w-full !py-3.5 text-base">{busy ? "Creating account…" : "Create account"}</button>
      <p className="mt-5 text-center text-sm text-muted">Already have an account? <Link href="/login" className="font-semibold text-brand underline">Sign in</Link></p>
    </form>
  );
}
export default function Register() { return <AuthShell><Suspense><Form /></Suspense></AuthShell>; }
