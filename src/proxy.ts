import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const hasSessionCookie =
    request.cookies.has("__Secure-next-auth.session-token") ||
    request.cookies.has("next-auth.session-token");

  // If a session cookie exists but token parsing fails (e.g. temporary
  // secret mismatch between app instances), let the request continue and let
  // server-side session checks make the final decision.
  if (token || hasSessionCookie) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
