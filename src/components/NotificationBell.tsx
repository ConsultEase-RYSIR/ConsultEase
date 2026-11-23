import Link from "next/link";

/** Bell button with an unread badge. Links to the notifications page, so it works with keyboard and screen readers. */
export function NotificationBell({ href, count }: { href: string; count: number }) {
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <Link href={href} aria-label={label}
      className="relative grid h-11 w-11 place-items-center rounded-xl border border-line bg-white text-ink transition hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 && <span aria-hidden className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-700 px-1 text-[11px] font-bold text-white">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}