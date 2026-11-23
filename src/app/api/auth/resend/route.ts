import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueCode } from "@/lib/verification";

export async function POST(req: Request) {
  const { email } = await req.json();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const user = await prisma.user.findUnique({ where: { email: String(email ?? "").toLowerCase() } });
  if (!user || user.emailVerified) return NextResponse.json({ ok: true }); // never reveal
  const r = await issueCode(user, ip);
  if (r.ok) return NextResponse.json({ ok: true });
  if (r.reason === "send_failed") return NextResponse.json({ error: "We couldn't send the code. Please try again." }, { status: 502 });
  return NextResponse.json({ error: r.reason === "cooldown" ? `Wait ${r.retryAfterSec}s before requesting another code.` : "Too many requests. Try again later.", retryAfterSec: r.retryAfterSec }, { status: 429 });
}
