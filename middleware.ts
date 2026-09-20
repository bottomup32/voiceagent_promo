import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/auth";
import { VISITOR_COOKIE, VISITOR_MAX_AGE_SEC } from "@/lib/visitor";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // A demo link goes to a business, not a person, and several people there may
  // open it. Handing the browser an id here rather than in client JS means the
  // very first page view already carries one, and /api/track and /api/session
  // only ever read it back.
  if (pathname.startsWith("/c/")) {
    const response = NextResponse.next();
    if (!request.cookies.get(VISITOR_COOKIE)?.value) {
      response.cookies.set(VISITOR_COOKIE, crypto.randomUUID(), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: VISITOR_MAX_AGE_SEC,
      });
    }
    return response;
  }
  const isAdminApi = pathname.startsWith("/api/admin");
  const isLogin = pathname === "/admin/login" || pathname === "/api/admin/login";
  if (isLogin) return NextResponse.next();

  if (verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (isAdminApi) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/c/:path*"],
  runtime: "nodejs",
};
