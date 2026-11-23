import { randomInt, createHmac, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import { sendVerificationEmail } from "./email";

export const CODE_TTL_MS = 10 * 60_000, MAX_ATTEMPTS = 5, COOLDOWN_MS = 60_000, HOURLY_CAP = 5;

export const generateCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");
export const hashCode = (userId: string, code: string) =>
  createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "").update(`${userId}:${code}`).digest("hex");

export function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

export type CodeRow = { codeHash: string; expiresAt: Date; attempts: number; usedAt: Date | null };
export type CheckResult = "ok" | "wrong" | "expired" | "locked" | "used";

/** Pure check: order matters (used > expired > locked > compare). */
export function checkCode(row: CodeRow, userId: string, input: string, now = new Date()): CheckResult {
  if (row.usedAt) return "used";
  if (row.expiresAt <= now) return "expired";
  if (row.attempts >= MAX_ATTEMPTS) return "locked";
  return safeEqualHex(row.codeHash, hashCode(userId, input)) ? "ok" : "wrong";
}

export type IssueResult = { ok: true } | { ok: false; reason: "cooldown" | "limit" | "send_failed"; retryAfterSec?: number };

export async function issueCode(user: { id: string; email: string; name: string }, ip: string): Promise<IssueResult> {
  const now = Date.now(), emailKey = user.email.toLowerCase();
  const last = await prisma.codeSendLog.findFirst({ where: { emailKey }, orderBy: { createdAt: "desc" } });
  if (last && now - last.createdAt.getTime() < COOLDOWN_MS)
    return { ok: false, reason: "cooldown", retryAfterSec: Math.ceil((COOLDOWN_MS - (now - last.createdAt.getTime())) / 1000) };
  const since = new Date(now - 3_600_000);
  const [byEmail, byIp] = await Promise.all([
    prisma.codeSendLog.count({ where: { emailKey, createdAt: { gte: since } } }),
    prisma.codeSendLog.count({ where: { ip, createdAt: { gte: since } } }),
  ]);
  if (byEmail >= HOURLY_CAP || byIp >= HOURLY_CAP * 3) return { ok: false, reason: "limit" };

  const code = generateCode();
  await prisma.$transaction([
    prisma.verificationCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }), // invalidate older
    prisma.verificationCode.create({ data: { userId: user.id, codeHash: hashCode(user.id, code), expiresAt: new Date(now + CODE_TTL_MS) } }),
    prisma.codeSendLog.create({ data: { emailKey, ip } }),
  ]);
  try { await sendVerificationEmail(user.email, user.name, code, CODE_TTL_MS / 60_000); }
  catch (e) { console.error("Verification email failed:", (e as Error).message); return { ok: false, reason: "send_failed" }; }
  return { ok: true };
}

export async function verifyCode(email: string, input: string): Promise<CheckResult | "invalid"> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || user.emailVerified) return "invalid";
  const row = await prisma.verificationCode.findFirst({ where: { userId: user.id, usedAt: null }, orderBy: { createdAt: "desc" } });
  if (!row) return "invalid";
  const result = checkCode(row, user.id, input);
  if (result === "ok") {
    await prisma.$transaction([
      prisma.verificationCode.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
    ]);
  } else if (result === "wrong") {
    const upd = await prisma.verificationCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    if (upd.attempts >= MAX_ATTEMPTS) await prisma.verificationCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  }
  return result;
}
