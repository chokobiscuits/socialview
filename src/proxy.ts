import { NextResponse, type NextRequest } from "next/server";

/**
 * Next 16 renamed `middleware` to `proxy`. It runs on the Node runtime, but the
 * docs warn it may be hoisted to a CDN and should not depend on shared modules,
 * so this only does a cheap cookie presence check to bounce obvious anonymous
 * traffic. It is NOT the security boundary: every protected page and route
 * handler calls `auth()` itself and verifies the session against the database.
 */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((c) => request.cookies.has(c));
  if (hasSession) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/videos/:path*",
    "/analytics/:path*",
    "/calendar/:path*",
    "/platforms/:path*",
    "/settings/:path*",
  ],
};
