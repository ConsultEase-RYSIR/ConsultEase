import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
export default withAuth(
  (req) => {
    const role = req.nextauth.token?.role, p = req.nextUrl.pathname;
    if (p.startsWith("/student") && role !== "STUDENT") return NextResponse.redirect(new URL("/professor/dashboard", req.url));
    if (p.startsWith("/professor") && role !== "PROFESSOR") return NextResponse.redirect(new URL("/student/dashboard", req.url));
  },
  { callbacks: { authorized: ({ token }) => !!token } },
);
export const config = { matcher: ["/student/:path*", "/professor/:path*"] };
