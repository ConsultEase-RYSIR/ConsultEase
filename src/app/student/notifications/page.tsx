import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDay, fmtTime } from "@/lib/format";
import { groupItems, groupLabel, PAGE_SIZE, parsePage, safeHref } from "@/lib/notificationRules";
import NotificationList from "./NotificationList";

export default async function StudentNotifications({ searchParams }: { searchParams: { f?: string; p?: string } }) {
  const uid = ((await getServerSession(authOptions))?.user as any).id as string;
  const unreadOnly = searchParams.f === "unread", page = parsePage(searchParams.p);
  const where = { userId: uid, ...(unreadOnly ? { readAt: null } : {}) };

  const [rows, unreadTotal] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE + 1 }),
    prisma.notification.count({ where: { userId: uid, readAt: null } }),
  ]);
  const hasMore = rows.length > PAGE_SIZE, shown = rows.slice(0, PAGE_SIZE), now = new Date();
  const groups = groupItems(shown, now).map((g) => ({
    label: g.label,
    items: g.items.map((n) => ({
      id: n.id, text: n.text, href: safeHref(n.href), unread: !n.readAt,
      when: groupLabel(n.createdAt, now) === "Earlier" ? `${fmtDay(n.createdAt)} · ${fmtTime(n.createdAt)}` : fmtTime(n.createdAt),
    })),
  }));
  const q = (o: { f?: string; p?: number }) => { const s = new URLSearchParams(); if (o.f) s.set("f", o.f); if (o.p && o.p > 1) s.set("p", String(o.p)); const t = s.toString(); return `/student/notifications${t ? "?" + t : ""}`; };
  const tab = (active: boolean) => `rounded-full border px-4 py-1.5 text-sm ${active ? "border-brand bg-tint font-semibold" : "border-line bg-white hover:border-gray-300"}`;

  return (
    <>
      <header className="mb-6"><h1 className="text-3xl font-bold">Notifications</h1><p className="text-muted">Updates about your requests, check-ins, documents and feedback.</p></header>
      <div className="max-w-3xl">
        <div className="mb-4 flex gap-2">
          <Link href={q({})} className={tab(!unreadOnly)} aria-current={!unreadOnly ? "page" : undefined}>All</Link>
          <Link href={q({ f: "unread" })} className={tab(unreadOnly)} aria-current={unreadOnly ? "page" : undefined}>Unread{unreadTotal > 0 ? ` · ${unreadTotal}` : ""}</Link>
        </div>
        {shown.length === 0
          ? <div className="card text-muted">{unreadOnly ? (page > 1 ? "Nothing on this page." : "No unread notifications.") : page > 1 ? "Nothing on this page." : "No notifications yet. Updates about your consultations will appear here."}{page > 1 && <> <Link href={q({ f: searchParams.f === "unread" ? "unread" : undefined })} className="font-semibold text-brand underline">Back to the first page</Link></>}</div>
          : <NotificationList key={`${unreadOnly}-${page}`} groups={groups} unreadTotal={unreadTotal} />}
        {(page > 1 || hasMore) && shown.length > 0 && (
          <div className="mt-2 flex justify-between text-sm font-semibold text-brand">
            {page > 1 ? <Link href={q({ f: unreadOnly ? "unread" : undefined, p: page - 1 })}>← Newer</Link> : <span />}
            {hasMore && <Link href={q({ f: unreadOnly ? "unread" : undefined, p: page + 1 })}>Older →</Link>}
          </div>)}
      </div>
    </>
  );
}
