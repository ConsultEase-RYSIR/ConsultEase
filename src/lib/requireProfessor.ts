import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

/** The signed-in professor (id and name), or null for anyone else. */
export async function requireProfessor() {
  const s = await getServerSession(authOptions);
  const id = (s?.user as any)?.id as string | undefined;
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true } });
  return u && u.role === "PROFESSOR" ? u : null;
}
