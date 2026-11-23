import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanName, validateName } from "@/lib/documentsRules";
import { hasSignature, precheck, removeFile, saveFile } from "@/lib/documentsServer";
import { fmtDay } from "@/lib/format";

export const runtime = "nodejs";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = (await getServerSession(authOptions))?.user as any;
  if (u?.role !== "STUDENT") return fail("Sign in as a student.", 401);
  const d = await prisma.document.findFirst({ where: { id: params.id, appointment: { studentId: u.id, status: { in: ["PENDING", "APPROVED"] } } }, include: { appointment: true } });
  if (!d) return fail("This requirement isn't open for uploads.", 404);
  if (d.status === "REVIEWED") return fail("Your professor already reviewed this file.", 409);

  const f = (await req.formData().catch(() => null))?.get("file");
  if (!f || typeof f === "string") return fail("Choose a file to upload.", 400);
  const v = validateName(f.name, f.size);
  if ("error" in v) return fail(v.error, 400);
  const buf = Buffer.from(await f.arrayBuffer());
  if (!hasSignature(buf, v.ext)) return fail(`That doesn't look like a real ${v.ext.toUpperCase()} file.`, 400);

  const checks = precheck(buf, v.ext), key = await saveFile(d.id, v.ext, buf), old = d.storageKey;
  await prisma.document.update({ where: { id: d.id }, data: { storageKey: key, fileName: cleanName(f.name), fileSize: buf.length, status: "SUBMITTED", precheck: checks, professorComment: null, submittedAt: new Date() } });
  await removeFile(old);
  await prisma.notification.create({ data: { userId: d.appointment.professorId, text: `${u.name} uploaded ${cleanName(f.name)} for the ${fmtDay(d.appointment.startsAt)} consultation.`, href: "/professor/documents" } });
  return NextResponse.json({ ok: true, checks });
}
