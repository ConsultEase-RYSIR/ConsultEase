import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/documentsServer";

export const runtime = "nodejs";

// Download a file. Only the student who uploaded it and the professor it was sent to can open it.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const u = (await getServerSession(authOptions))?.user as any;
  if (!u) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const d = await prisma.document.findFirst({ where: { id: params.id, storageKey: { not: null }, appointment: u.role === "STUDENT" ? { studentId: u.id } : { professorId: u.id } } });
  const p = d?.storageKey && path.resolve(process.cwd(), d.storageKey);
  if (!d || !p || !p.startsWith(UPLOAD_DIR + path.sep)) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const buf = await readFile(p).catch(() => null);
  if (!buf) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const pdf = p.endsWith(".pdf"), inline = pdf && new URL(req.url).searchParams.has("inline");
  return new NextResponse(buf, { headers: {
    "Content-Type": pdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(d.fileName ?? "document")}"`,
    "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
  } });
}
