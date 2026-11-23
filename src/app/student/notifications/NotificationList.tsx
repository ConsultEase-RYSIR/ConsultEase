"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Item = { id: string; text: string; href: string | null; when: string; unread: boolean };
type Group = { label: string; items: Item[] };

async function markRead(body: object) {
  const r = await fetch("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error();
}

export default function NotificationList({ groups, unreadTotal }: { groups: Group[]; unreadTotal: number }) {
  const router = useRouter();
  const [read, setRead] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [allRead, setAllRead] = useState(false);
  const isUnread = (i: Item) => i.unread && !read.has(i.id) && !allRead;
  const remaining = allRead ? 0 : Math.max(0, unreadTotal - read.size);

  async function open(e: React.MouseEvent, i: Item) {
    if (!i.href) return;
    const modified = e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0;
    if (!isUnread(i)) return; // already read: normal link
    setRead((s) => new Set(s).add(i.id));
    if (modified) { markRead({ id: i.id }).catch(() => {}); return; }
    e.preventDefault();
    try { await markRead({ id: i.id }); } catch { /* still go there; it stays unread */ }
    router.push(i.href);
  }
  async function markAll() {
    setBusy(true); setErr(null);
    try { await markRead({ all: true }); setAllRead(true); router.refresh(); }
    catch { setErr("Could not mark them as read. Try again."); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">{remaining > 0 ? `${remaining} unread` : "You're all caught up."}</p>
        <button type="button" onClick={markAll} disabled={busy || remaining === 0} className="btn-ghost disabled:opacity-50">Mark all as read</button>
      </div>
      {err && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {groups.map((g) => (
        <section key={g.label} className="mb-5">
          <h2 className="mb-2 text-sm font-semibold text-muted">{g.label}</h2>
          <ul className="card divide-y divide-line !p-0">
            {g.items.map((i) => {
              const u = isUnread(i);
              const body = (<>
                <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${u ? "bg-brand" : "bg-transparent"}`} />
                <span className="min-w-0 flex-1"><span className={`block text-sm ${u ? "font-semibold" : ""}`}>{u && <span className="sr-only">Unread: </span>}{i.text}</span><span className="block text-xs text-muted">{i.when}</span></span>
                {i.href && <span aria-hidden className="text-muted">›</span>}
              </>);
              return <li key={i.id}>{i.href
                ? <Link href={i.href} onClick={(e) => open(e, i)} className={`flex gap-3 px-5 py-4 hover:bg-canvas ${u ? "bg-tint/40" : ""}`}>{body}</Link>
                : <div className={`flex gap-3 px-5 py-4 ${u ? "bg-tint/40" : ""}`}>{body}</div>}</li>;
            })}
          </ul>
        </section>))}
    </div>
  );
}
