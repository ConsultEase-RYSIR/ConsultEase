"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const NAV = {
  STUDENT: [["Dashboard", "/student/dashboard"], ["Request consultation", "/student/request"], ["Queue, QR & check-in", "/student/queue"], ["Documents", "/student/documents"], ["History & feedback", "/student/history"]],
  PROFESSOR: [["Dashboard", "/professor/dashboard"], ["Availability & settings", "/professor/availability"], ["Queue & attendance", "/professor/queue"], ["Document review", "/professor/documents"], ["Notes & summaries", "/professor/notes"]],
} as const;

export function Sidebar({ role, name, sub }: { role: "STUDENT" | "PROFESSOR"; name: string; sub: string }) {
  const path = usePathname();
  const initials = name.replace(/^Prof\.\s*/, "").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <aside className="sticky top-0 flex h-screen w-[228px] shrink-0 flex-col bg-ink p-4 text-white">
      <div className="mb-6 flex items-center gap-2.5 px-2 pt-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-ink">≡</span><b className="text-xl">ConsultEase</b></div>
      <nav className="space-y-1">
        {NAV[role].map(([label, href]) => (
          <Link key={href} href={href} className={`block rounded-xl px-3 py-2.5 text-sm ${path.startsWith(href) ? "bg-white/10 font-semibold" : "text-slate-300 hover:bg-white/5"}`}>{label}</Link>))}
      </nav>
      <div className="mt-auto border-t border-white/10 pt-4">
        <div className="flex items-center gap-3">
          <span className={`grid h-10 w-10 place-items-center rounded-full font-bold text-ink ${role === "STUDENT" ? "bg-accent" : "bg-amber-400"}`}>{initials}</span>
          <div className="text-sm"><b className="block">{name}</b><span className="text-xs text-slate-400">{sub}</span></div>
        </div>
        <button onClick={() => signOut({ callbackUrl: "/login" })} className="mt-3 px-1 text-sm text-slate-300">Sign out</button>
      </div>
    </aside>
  );
}
