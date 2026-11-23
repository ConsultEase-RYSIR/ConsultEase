import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** The signed-in professor's id, or null for anyone else (students, signed-out). Checked against the database, not just the token. */
export async function getProfessorId(): Promise<string | null> {
  const id = ((await getServerSession(authOptions))?.user as any)?.id as string | undefined;
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  return u?.role === "PROFESSOR" ? id : null;
}
