import { NextResponse } from "next/server";
import { verifyCode } from "@/lib/verification";

const MSG = { wrong: "That code isn't right.", expired: "That code expired. Request a new one.", locked: "Too many attempts. Request a new code.", used: "That code was already used. Request a new one.", invalid: "That code isn't valid. Request a new one." } as const;

export async function POST(req: Request) {
  const { email, code } = await req.json();
  if (!/^\d{6}$/.test(String(code ?? ""))) return NextResponse.json({ error: MSG.wrong }, { status: 400 });
  const r = await verifyCode(String(email ?? ""), code);
  return r === "ok" ? NextResponse.json({ ok: true }) : NextResponse.json({ error: MSG[r] }, { status: 400 });
}
