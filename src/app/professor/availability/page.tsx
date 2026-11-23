import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DAYS, manilaParts, type DayInput } from "@/lib/availability";
import { futureAppointments } from "@/lib/availabilityServer";
import { AvailabilityForm } from "./AvailabilityForm";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const s = await getServerSession(authOptions);
  const id = (s?.user as any).id as string; // the professor layout already guarantees a signed-in professor
  const [settings, rows, appts] = await Promise.all([
    prisma.professorSettings.upsert({ where: { professorId: id }, update: {}, create: { professorId: id } }),
    prisma.availabilityDay.findMany({ where: { professorId: id } }),
    futureAppointments(id),
  ]);
  const days: DayInput[] = DAYS.map(({ weekday }) => {
    const r = rows.find((x) => x.weekday === weekday);
    return r
      ? { weekday, enabled: r.enabled, startMin: r.startMin, endMin: r.endMin, faceToFace: r.faceToFace, online: r.online }
      : { weekday, enabled: false, startMin: 13 * 60, endMin: 16 * 60, faceToFace: true, online: false };
  });
  const now = manilaParts(new Date());
  return (
    <AvailabilityForm
      initialDays={days}
      initialSettings={{
        durationMin: settings.durationMin, graceMin: settings.graceMin, autoCancel: settings.autoCancel,
        requireReschedule: settings.requireReschedule, building: settings.building, floor: settings.floor,
        room: settings.room, meetingLink: settings.meetingLink ?? "",
      }}
      appts={appts}
      todayKey={now.dateKey}
      nowMin={now.min}
    />
  );
}
