import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [Credentials({
    credentials: { email: {}, password: {}, role: {} },
    async authorize(c) {
      const u = await prisma.user.findUnique({ where: { email: (c?.email ?? "").toLowerCase() } });
      if (!u || !(await bcrypt.compare(c?.password ?? "", u.passwordHash))) return null;
      if (u.role !== c?.role) return null;                       // wrong portal => same generic failure
      if (!u.emailVerified) throw new Error("UNVERIFIED");        // cannot log in until verified
      return { id: u.id, name: u.name, email: u.email, role: u.role } as any;
    },
  })],
  callbacks: {
    jwt: ({ token, user }) => { if (user) { token.uid = user.id; token.role = (user as any).role; } return token; },
    session: ({ session, token }) => { (session.user as any).id = token.uid; (session.user as any).role = token.role; return session; },
  },
};
