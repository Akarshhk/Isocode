import { NextResponse, type NextRequest } from "next/server";
import { HOME_FOR_ROLE, SESSION_COOKIE, rolesForPath, verifySession } from "@/lib/auth/token";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/" || pathname === "/login") {
    if (session) return NextResponse.redirect(new URL(HOME_FOR_ROLE[session.role], req.url));
    return pathname === "/" ? NextResponse.redirect(new URL("/login", req.url)) : NextResponse.next();
  }

  const roles = rolesForPath(pathname);
  if (!roles) return NextResponse.next();
  if (!session) {
    if (pathname.startsWith("/api/")) return new NextResponse("Unauthorised", { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (!roles.includes(session.role)) {
    if (pathname.startsWith("/api/")) return new NextResponse("Forbidden", { status: 403 });
    return NextResponse.redirect(new URL(HOME_FOR_ROLE[session.role], req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|icons/).*)"],
};
