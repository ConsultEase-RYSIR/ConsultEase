// Sample professors so students have schedules to pick from. Safe to run twice.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();
const profs = [];
(async () => {
  const passwordHash = await bcrypt.hash("password123", 12);
  for (const p of profs) {
    const u = await prisma.user.upsert({ where: { email: p.email }, update: {}, create: { email: p.email, name: p.name, passwordHash, role: "PROFESSOR", emailVerified: true, department: "Engineering" } });
    await prisma.professorSettings.upsert({ where: { professorId: u.id }, update: {}, create: { professorId: u.id, durationMin: 30, graceMin: 5, building: p.building, floor: p.floor, room: p.room } });
    for (const d of p.days)
      await prisma.availabilityDay.upsert({ where: { professorId_weekday: { professorId: u.id, weekday: d } }, update: {}, create: { professorId: u.id, weekday: d, startMin: p.start, endMin: p.end, faceToFace: p.f2f, online: p.online } });
  }
  console.log("Seeded", profs.length, "professors.");
})().finally(() => prisma.$disconnect());
