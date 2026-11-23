"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

const roles = {
  STUDENT: { label: "Student", blurb: "Request and track consultations", icon: "🎓", email: "name@student.university.edu", home: "/student/dashboard" },
  PROFESSOR: { label: "Professor", blurb: "Manage availability and the queue", icon: "🖥", email: "name@university.edu", home: "/professor/dashboard" },
} as const;

export default function Login() {
  const router = useRouter();
  const [role, setRole] = useState<keyof typeof roles>("STUDENT");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const r = roles[role];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const f = new FormData(e.currentTarget);
    const res = await signIn("credentials", { redirect: false, email: f.get("email"), password: f.get("password"), role });
    setBusy(false);
    if (res?.error === "UNVERIFIED") return router.push(`/verify?email=${encodeURIComponent(String(f.get("email")))}`);
    if (res?.error) return setError("Email or password is incorrect for this account type.");
    router.push(r.home);
  }

  return (
    <main className="grid min-h-screen md:grid-cols-[48%_52%]">
      <section className="hidden flex-col justify-center bg-ink px-16 text-white md:flex">
        <div className="mb-14 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-ink">≡</span><b className="text-3xl">ConsultEase</b></div>
        <h1 className="max-w-xl text-5xl font-bold leading-[1.1]">Faculty consultations, scheduled without the back-and-forth.</h1>
        <p className="mt-6 max-w-md text-lg text-slate-300">A smart consultation management system for students and professors.</p>
        <ul className="mt-10 max-w-md space-y-5 text-slate-100">
          {["Pick a slot from your professor's live availability, with conflicts caught automatically.", "Check in with a QR code and see your queue number and estimated wait.", "Keep documents, notes, feedback and history together in one place."].map((t) => (
            <li key={t} className="flex gap-3"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs text-accent">✓</span>{t}</li>))}
        </ul>
      </section>
      <section className="grid place-items-center bg-canvas p-6">
        <form onSubmit={submit} className="w-full max-w-[470px] rounded-3xl border border-line bg-white p-9">
          <h2 className="text-3xl font-bold">Sign in</h2>
          <p className="mt-1 text-muted">First, tell us who you are.</p>
          <div className="mt-6 grid grid-cols-2 gap-3" role="radiogroup">
            {(Object.keys(roles) as (keyof typeof roles)[]).map((k) => (
              <button type="button" key={k} role="radio" aria-checked={role === k} onClick={() => setRole(k)}
                className={`rounded-xl border-2 p-4 text-center ${role === k ? "border-brand bg-tint" : "border-line"}`}>
                <div className="text-brand">{roles[k].icon}</div><b className="block">{roles[k].label}</b>
                <span className="text-xs text-muted">{roles[k].blurb}</span>
              </button>))}
          </div>
          <label className="mt-6 block text-sm font-semibold">{r.label} email
                        <input name="email" type="email" autoComplete="off" required placeholder={r.email} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 font-normal" /></label>
          <label className="mt-4 block text-sm font-semibold">Password
                       <input name="password" type="password" autoComplete="new-password" required placeholder="Enter your password" className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 font-normal" /></label>
          <div className="mt-4 flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-muted"><input type="checkbox" name="remember" className="h-4 w-4" />Keep me signed in</label>
            <Link href="/forgot-password" className="font-semibold text-brand underline">Forgot password?</Link>
          </div>
          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button disabled={busy} className="btn mt-6 w-full !py-3.5 text-base">{busy ? "Signing in…" : `Sign in as ${r.label.toLowerCase()}`}</button>
          <p className="mt-5 text-center text-sm text-muted">You will land on the {role === "STUDENT" ? "student" : "faculty"} dashboard · <Link href={`/register?role=${role}`} className="font-semibold text-brand underline">Create account</Link></p>
        </form>
      </section>
    </main>
  );
}
