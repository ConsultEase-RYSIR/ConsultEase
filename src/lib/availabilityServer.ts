import { prisma } from "./prisma";
import { manilaParts, type ApptLite } from "./availability";

const ACTIVE = ["PENDING", "APPROVED", "WAITING", "CHECKED_IN", "IN_CONSULTATION", "LATE"] as const;

/** Upcoming consultations that still hold a slot, reduced to what conflict checks need. */
export async function futureAppointments(professorId: string): Promise<ApptLite[]> {
  const rows = await prisma.appointment.findMany({
    where: { professorId, startsAt: { gte: new Date() }, status: { in: [...ACTIVE] } },
    include: { student: { select: { name: true } } },
    orderBy: { startsAt: "asc" },
  });
  return rows.map((a) => {
    const s = manilaParts(a.startsAt), e = manilaParts(a.endsAt);
    return {
      id: a.id, studentName: a.student.name, weekday: s.weekday, startMin: s.min,
      endMin: e.dateKey === s.dateKey ? e.min : 24 * 60, mode: a.mode, dateKey: s.dateKey,
    };
  });
}
