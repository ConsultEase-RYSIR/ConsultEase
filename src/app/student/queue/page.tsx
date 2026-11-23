import Link from "next/link";
import { getServerSession } from "next-auth";
import QRCode from "qrcode";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { estimateWait, fmtDay, fmtRange, PRIORITY } from "@/lib/format";
import { checkInWindow, fmtOpens, manualCode, progressSteps } from "@/lib/queueRules";
import { expireNoShows } from "@/lib/queueServer";
import { AutoRefresh, CancelControls, OnlineCheckIn } from "./QueueActions";

export const dynamic = "force-dynamic";
const ACTIVE = ["APPROVED", "CHECKED_IN", "IN_CONSULTATION"] as const;
type Appt = Awaited<ReturnType<typeof load>>["list"][number];

async function load(uid: string, apptId?: string) {
  await expireNoShows({ studentId: uid });
  const now = new Date(), inc = { professor: { include: { settings: true } } };
  const [list, waits, picked] = await Promise.all([
    prisma.appointment.findMany({ where: { studentId: uid, endsAt: { gte: now }, status: { in: ["PENDING", ...ACTIVE] } }, include: inc, orderBy: { startsAt: "asc" } }),
    prisma.waitlistEntry.findMany({ where: { studentId: uid, status: { in: ["WAITING", "OFFERED", "APPROVED"] } }, orderBy: { startsAt: "asc" } }),
    apptId ? prisma.appointment.findFirst({ where: { id: apptId, studentId: uid }, include: inc }) : null,
  ]);
  const names = await prisma.user.findMany({ where: { id: { in: waits.map((w) => w.professorId) } }, select: { id: true, name: true } });
  return { list, waits, picked, names: Object.fromEntries(names.map((n) => [n.id, n.name])) };
}

const Chip = ({ s }: { s: { label: string; state: string } }) => (
  <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${s.state === "done" ? "bg-green-100 text-green-800" : s.state === "current" ? "border-2 border-brand bg-white text-brand" : "bg-gray-100 text-slate-600"}`}>{s.label}</span>);

const Pill = ({ p }: { p: keyof typeof PRIORITY }) => (
  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${PRIORITY[p].cls}`}><i className={`mr-1.5 inline-block h-2 w-2 rounded-full ${PRIORITY[p].dot}`} />{PRIORITY[p].label}</span>);

function Online({ a }: { a: Appt }) {
  const s = a.professor.settings, w = checkInWindow(a.startsAt, s?.graceMin ?? 5, true), link = s?.meetingLink;
  return a.status === "APPROVED"
    ? <OnlineCheckIn id={a.id} opensAt={w.opensAt.toISOString()} closesAt={w.closesAt.toISOString()} opensLabel={fmtOpens(w.opensAt)} />
    : link?.startsWith("https://")
      ? <a href={link} target="_blank" rel="noopener noreferrer" className="btn w-full">Open meeting link</a>
      : <p className="text-sm text-slate-600">You're checked in. Your professor hasn't added a meeting link yet, so check back in a moment.</p>;
}

export default async function QueuePage({ searchParams }: { searchParams: { appt?: string } }) {
  const uid = ((await getServerSession(authOptions))?.user as any).id as string;
  const { list, waits, picked, names } = await load(uid, searchParams.appt);
  const sel = picked ?? list.find((a) => a.id === searchParams.appt) ?? list.find((a) => a.status !== "PENDING") ?? list[0];
  const others = list.filter((a) => a.id !== sel?.id);

  let qr = "", nowServing = 0;
  if (sel?.status === "APPROVED" && sel.mode === "FACE_TO_FACE" && sel.qrToken)
    qr = await QRCode.toString(sel.qrToken, { type: "svg", margin: 0, color: { dark: "#0f2132", light: "#0000" } });
  if (sel && sel.mode === "FACE_TO_FACE" && sel.queueNumber) {
    const d0 = new Date(sel.startsAt); d0.setHours(0, 0, 0, 0); const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
    nowServing = (await prisma.appointment.findFirst({ where: { professorId: sel.professorId, status: "IN_CONSULTATION", startsAt: { gte: d0, lt: d1 } } }))?.queueNumber ?? 0;
  }

  const live = sel && (ACTIVE as readonly string[]).includes(sel.status) && sel.endsAt >= new Date();
  const online = sel?.mode === "ONLINE", s = sel?.professor.settings, grace = s?.graceMin ?? 5;
  const lost = sel && !list.some((a) => a.id === sel.id);

  return (
    <div>
      <AutoRefresh />
      <h1 className="text-3xl font-bold">Queue, QR & check-in</h1>
      <p className="mt-1 text-muted">Show your QR code at the room, or check in online for virtual consultations.</p>

      {!sel && (
        <div className="card mt-6 max-w-xl"><h2 className="text-lg font-bold">No upcoming consultations</h2>
          <p className="mt-1 text-sm text-muted">Once your professor approves a request, your QR code and queue number appear here.</p>
          <Link href="/student/request" className="btn mt-4">Request consultation</Link></div>)}

      <div className="mt-6 grid grid-cols-[1fr_340px] gap-6">
        {sel && (
          <section className="card !p-6 self-start">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm text-muted">{online ? "Online" : "Face-to-face"} · {fmtDay(sel.startsAt)} · {fmtRange(sel.startsAt, sel.endsAt)}</p>
                <h2 className="text-xl font-bold">{sel.title} with {sel.professor.name}</h2></div>
              <Pill p={sel.priority} />
            </div>

            {lost && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{sel.status === "NO_SHOW" ? `Your slot was cancelled because check-in closed ${grace} minutes after the start. Request a new appointment to continue.` : sel.status === "DECLINED" ? "Your professor declined this request. Pick another slot to try again." : sel.status === "COMPLETED" ? "This consultation is complete. Find your professor's feedback under History & feedback." : "This appointment is no longer active."}
              <Link href={sel.status === "COMPLETED" ? "/student/history" : "/student/request"} className="ml-1 font-semibold underline">{sel.status === "COMPLETED" ? "Open history" : "Request consultation"}</Link></p>}

            {sel.status === "PENDING" && !lost && (
              <><p className="mt-5 rounded-xl bg-canvas p-4 text-sm text-slate-700">Waiting for {sel.professor.name} to approve. Your QR code and queue number appear here once it's approved.</p>
                <CancelControls id={sel.id} pending /></>)}

            {live && !online && (
              <>
                <div className="mt-5 flex gap-4">
                  <div className="w-[196px] shrink-0 rounded-2xl border border-line p-4 text-center">
                    {qr ? <div className="mx-auto h-[150px] w-[150px] [&>svg]:h-full [&>svg]:w-full" role="img" aria-label="Your check-in QR code" dangerouslySetInnerHTML={{ __html: qr }} />
                      : <div className="grid h-[150px] place-items-center rounded-xl bg-green-50 text-sm font-semibold text-green-800">✓ Checked in</div>}
                    <p className="mt-2 text-xs text-muted">Valid for this appointment only</p>
                    {sel.qrToken && qr && <p className="mt-1 text-xs text-slate-600">Code <b className="tracking-wider">{manualCode(sel.qrToken)}</b></p>}
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="rounded-2xl bg-ink p-5 text-white">
                      <div className="flex gap-8">
                        <div><span className="text-xs text-slate-400">Your number</span><b className="block text-4xl">#{sel.queueNumber ?? "–"}</b></div>
                        <div><span className="text-xs text-slate-400">Now serving</span><b className="block text-4xl">{nowServing ? `#${nowServing}` : "–"}</b></div>
                      </div>
                      <span className="mt-3 block text-xs text-slate-400">Estimated wait</span>
                      <b className="text-4xl">{sel.status === "IN_CONSULTATION" ? "Now" : <>{estimateWait((sel.queueNumber ?? 0) - nowServing)} <span className="text-xl">min</span></>}</b>
                    </div>
                    {sel.status === "APPROVED" && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Check in within <b>{grace} minutes</b> of your start time. After that your slot is cancelled automatically and you will need to reschedule.</p>}
                  </div>
                </div>
                <h3 className="mt-6 font-bold">Where to go</h3>
                <div className="mt-2 grid grid-cols-3 gap-3">
                  {[["Building", s?.building], ["Floor", s?.floor], ["Room", s?.room]].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-canvas p-3"><span className="text-xs text-muted">{k}</span><b className="block">{v || "–"}</b></div>))}
                </div>
              </>)}

            {live && online && (
              <div className="mt-5 rounded-2xl bg-canvas p-5"><p className="text-sm text-slate-700">Online check-in opens 10 minutes before the start. You will be signed in with your student account and the meeting link appears once you check in.</p>
                <div className="mt-4"><Online a={sel as Appt} /></div></div>)}

            {live && (
              <>
                <h3 className="mt-6 font-bold">Status</h3>
                <div className="mt-2 flex flex-wrap gap-2">{progressSteps(sel.status, online).map((x) => <Chip key={x.label} s={x} />)}</div>
                {sel.status === "APPROVED" || sel.status === "CHECKED_IN" ? <CancelControls id={sel.id} /> : <div className="mt-5"><Link href="/student/dashboard" className="btn-ghost">Back to dashboard</Link></div>}
              </>)}
          </section>)}

        <aside className="space-y-5">
          {others.map((a) => {
            const on = a.mode === "ONLINE", p = PRIORITY[a.priority];
            return (
              <section key={a.id} className="card">
                <p className="text-sm text-muted">{on ? "Online" : "Face-to-face"} · {fmtDay(a.startsAt)} · {fmtRange(a.startsAt, a.endsAt)}</p>
                <h3 className="mt-1 text-lg font-bold">{a.title} with {a.professor.name}</h3>
                <p className="mt-2 text-xs font-semibold"><span className={`rounded-full px-3 py-1 ${p.cls}`}><i className={`mr-1.5 inline-block h-2 w-2 rounded-full ${p.dot}`} />{p.label}</span>{a.status === "PENDING" && <span className="ml-2 rounded-full bg-gray-100 px-3 py-1 text-slate-600">Pending</span>}</p>
                <div className="mt-4">{on && a.status !== "PENDING" ? <Online a={a} /> : <Link href={`/student/queue?appt=${a.id}`} className="btn-ghost w-full">View details</Link>}</div>
              </section>);
          })}
          <section className="card"><h2 className="text-lg font-bold">If you miss your slot</h2>
            <p className="mt-2 text-sm text-slate-600">Your professor can override an automatic no-show cancellation. Otherwise you will be asked to request a new appointment.</p></section>
          <section id="waitlist" className="card"><h2 className="text-lg font-bold">Waitlist</h2>
            {waits.length ? waits.map((w) => (
              <div key={w.id} className="mt-3 text-sm"><b>{names[w.professorId] ?? "Professor"} · {fmtDay(w.startsAt)} · {fmtRange(w.startsAt, w.startsAt).split(" – ")[1]}</b>
                <p className="text-slate-600">{w.status === "WAITING" ? "You're on the list. We'll notify you if the slot opens." : w.status === "OFFERED" ? "A slot opened. Waiting for the professor to approve your replacement booking." : "Your professor approved a replacement. Request the slot now."}
                  {w.status === "APPROVED" && <Link href="/student/request" className="ml-1 font-semibold text-brand underline">Request slot</Link>}</p></div>))
              : <p className="mt-2 text-sm text-slate-600">You're not on any waitlist. When a slot is full, join its waitlist from the request page.</p>}</section>
        </aside>
      </div>
    </div>
  );
}