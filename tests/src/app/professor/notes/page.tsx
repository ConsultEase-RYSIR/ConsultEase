import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDay, fmtRange, PRIORITY } from "@/lib/format";
import { dateToDue, dayKey, revisionStats } from "@/lib/notesRules";
import NotesWorkspace from "./NotesWorkspace";

const MODE = { FACE_TO_FACE: "Face-to-face", ONLINE: "Online" } as const;
const OPEN = ["IN_CONSULTATION", "COMPLETED"] as const;

export default async function NotesPage({ searchParams }: { searchParams: { a?: string } }) {
  const uid = ((await getServerSession(authOptions))?.user as any).id as string;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const pick = { id: true, startsAt: true, endsAt: true, status: true, title: true, concern: true, mode: true, priority: true, studentId: true, student: { select: { name: true } }, record: { select: { status: true } } } as const;

  let list = await prisma.appointment.findMany({ where: { professorId: uid, status: { in: [...OPEN] }, startsAt: { gte: since } }, select: pick, orderBy: { startsAt: "desc" }, take: 40 });
  if (searchParams.a && !list.some((x) => x.id === searchParams.a)) {
    const extra = await prisma.appointment.findFirst({ where: { id: searchParams.a, professorId: uid, status: { in: [...OPEN] } }, select: pick });
    if (extra) list = [extra, ...list];
  }
  const head = <header className="mb-6"><h1 className="text-3xl font-bold">Notes &amp; summaries</h1><p className="text-muted">Record what was discussed, generate a structured summary and send feedback to the student.</p></header>;
  if (!list.length) return <>{head}<div className="card text-muted">No consultations to write up yet. Once you start or complete a consultation in Queue &amp; attendance, it appears here.</div></>;

  const sel = list.find((x) => x.id === searchParams.a) ?? list.find((x) => x.status === "IN_CONSULTATION") ?? list.find((x) => x.record?.status !== "SENT") ?? list[0];
  const tabs = [sel, ...list.filter((x) => x.id !== sel.id)].slice(0, 12);

  const [full, previous, evaluation] = await Promise.all([
    prisma.consultationRecord.findUnique({ where: { appointmentId: sel.id }, include: { revisions: { orderBy: { dueDate: "asc" } } } }),
    prisma.consultationRecord.findMany({
      where: { status: "SENT", appointmentId: { not: sel.id }, appointment: { studentId: sel.studentId, professorId: uid } },
      select: { id: true, feedback: true, appointment: { select: { startsAt: true, title: true } }, revisions: { select: { completedAt: true } } },
      orderBy: { appointment: { startsAt: "desc" } }, take: 30,
    }),
    prisma.evaluation.findFirst({ where: { appointment: { studentId: sel.studentId, professorId: uid } }, include: { appointment: { select: { startsAt: true } } }, orderBy: { appointment: { startsAt: "desc" } } }),
  ]);

  const today = dayKey(sel.startsAt) === dayKey(new Date());
  const whenLabel = `${today ? "Today" : fmtDay(sel.startsAt)} · ${fmtRange(sel.startsAt, sel.endsAt)} · ${MODE[sel.mode]}`;
  const tabState = (x: (typeof list)[number]) => x.record?.status === "SENT" ? "Sent" : x.status === "IN_CONSULTATION" ? "In consultation" : x.record ? "Draft" : "Needs summary";
  const prevRow = (r: (typeof previous)[number]) => {
    const total = r.revisions.length;
    return { id: r.id, head: `${fmtDay(r.appointment.startsAt).replace(/^\w+, /, "")} · ${r.appointment.title}`, sub: revisionStats(total, r.revisions.filter((v) => v.completedAt).length) };
  };
  const rows = previous.map(prevRow);

  return (
    <>
      {head}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <nav aria-label="Consultations" className="mb-5 flex flex-wrap gap-2">
            {tabs.map((x) => (
              <Link key={x.id} href={`/professor/notes?a=${x.id}`} aria-current={x.id === sel.id ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm ${x.id === sel.id ? "border-brand bg-tint font-semibold" : "border-line bg-white text-muted hover:border-gray-300"}`}>
                {x.student.name.split(" ")[0]} · {dayKey(x.startsAt) === dayKey(new Date()) ? "Today" : fmtDay(x.startsAt)} <span className="text-xs">({tabState(x)})</span>
              </Link>))}
          </nav>
          <NotesWorkspace key={sel.id} id={sel.id} student={sel.student.name} title={sel.title} whenLabel={whenLabel} priority={PRIORITY[sel.priority]}
            inConsultation={sel.status === "IN_CONSULTATION"} canSend={sel.status === "COMPLETED"}
            initial={{
              privateNotes: full?.privateNotes ?? "", concerns: full?.concerns ?? "", feedback: full?.feedback ?? "", status: full?.status ?? "DRAFT",
              sentLabel: full?.sentAt ? full.sentAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Manila" }) : null,
              revisions: (full?.revisions ?? []).map((r) => ({ id: r.id, text: r.text, due: dateToDue(r.dueDate), done: !!r.completedAt })),
            }} />
        </div>

        <aside className="space-y-5">
          <section className="card">
            <h2 className="text-lg font-bold">Previous records · {sel.student.name}</h2>
            {rows.length === 0 ? <p className="mt-2 text-sm text-muted">No earlier summaries sent to this student yet.</p> : (
              <ul className="mt-3 divide-y divide-line">
                {rows.slice(0, 3).map((r) => <li key={r.id} className="py-2"><b className="block text-sm">{r.head}</b><span className="text-sm text-muted">{r.sub}</span></li>)}
              </ul>)}
            {rows.length > 3 && (
              <details className="mt-1"><summary className="cursor-pointer text-sm font-semibold text-brand">Show all {rows.length} records</summary>
                <ul className="mt-2 divide-y divide-line">{rows.slice(3).map((r) => <li key={r.id} className="py-2"><b className="block text-sm">{r.head}</b><span className="text-sm text-muted">{r.sub}</span></li>)}</ul>
              </details>)}
          </section>

          <section className="card">
            <h2 className="text-lg font-bold">Student evaluation</h2>
            {evaluation ? (<>
              <p className="mt-2 text-2xl text-amber-500" aria-label={`${evaluation.rating} out of 5 stars`}>{"★".repeat(evaluation.rating)}<span className="text-amber-300">{"☆".repeat(5 - evaluation.rating)}</span></p>
              {evaluation.comment && <p className="mt-1 text-sm">“{evaluation.comment}”</p>}
              <p className="mt-2 text-sm text-muted">From the {fmtDay(evaluation.appointment.startsAt).replace(/^\w+, /, "")} consultation.</p>
            </>) : <p className="mt-2 text-sm text-muted">Evaluations appear here once the student submits them.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
