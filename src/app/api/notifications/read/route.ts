import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseReadRequest } from "@/lib/notificationRules";

// Marks the signed-in user's own notifications as read. Rows that belong to anyone else are never touched.
export async function POST(req: Request) {
  const uid = ((await getServerSession(authOptions))?.user as any)?.id as string | undefined;
  if (!uid) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = parseReadRequest(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const where = "all" in body ? { userId: uid, readAt: null } : { id: body.id, userId: uid, readAt: null };
  const r = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
  const unread = await prisma.notification.count({ where: { userId: uid, readAt: null } });
  return NextResponse.json({ marked: r.count, unread });
}
