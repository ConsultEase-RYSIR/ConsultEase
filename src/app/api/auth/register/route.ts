import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { issueCode } from "@/lib/verification";

const label = (r: string) => (r === "STUDENT" ? "student" : "professor");

export async function POST(req: Request) {
  const { name, email, password, role } = await req.json();
  if (!name || !/^\S+@\S+\.\S+$/.test(email ?? "") || (password ?? "").length < 8 || !["STUDENT", "PROFESSOR"].includes(role))
    return NextResponse.json({ error: "Check your details and try again." }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const lower = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: lower } });
  // One email = one account. Reject with a clear message if it is already taken by another role,
  // or by a verified account of the same role. An unverified same-role account just gets a new code.
  if (existing && (existing.emailVerified || existing.role !== role)) {
    return NextResponse.json({
      error: existing.role !== role
        ? `This email is already registered as a ${label(existing.role)} account. Use a different email to create a ${label(role)} account.`
        : "An account with this email already exists. Sign in instead.",
    }, { status: 409 });
  }

  let user = existing;
  if (!user) {
    try {
      user = await prisma.user.create({ data: { name, email: lower, role, passwordHash: await bcrypt.hash(password, 12) } });
    } catch (e: any) {
      if (e?.code === "P2002") return NextResponse.json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });
      throw e;
    }
  }
  if (!user.emailVerified) await issueCode(user, ip);
  return NextResponse.json({ ok: true, message: "A verification code is on its way." });
}