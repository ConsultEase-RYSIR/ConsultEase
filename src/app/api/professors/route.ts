import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profs = await prisma.user.findMany({
    where: { role: "PROFESSOR", availability: { some: { enabled: true } }, settings: { isNot: null } },
    select: { id: true, name: true, settings: true, availability: { where: { enabled: true }, orderBy: { weekday: "asc" } } }, orderBy: { name: "asc" },
  });
  return NextResponse.json({ professors: profs });
}
