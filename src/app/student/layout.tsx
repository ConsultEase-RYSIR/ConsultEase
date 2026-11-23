import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/Sidebar";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const s = await getServerSession(authOptions); const id = (s?.user as any)?.id;
  const u = id && (await prisma.user.findUnique({ where: { id } }));
  if (!u || u.role !== "STUDENT") redirect("/login");
  return <div className="flex min-h-screen"><Sidebar role="STUDENT" name={u.name} sub={`Student · ${u.program ?? ""}`} /><main className="flex-1 p-8">{children}</main></div>;
}
