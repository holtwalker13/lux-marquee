import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { COOKIE_NAME, getJwtSecretKey } from "@/lib/admin-auth";
import { absoluteUrl } from "@/lib/public-request-origin";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin")) return NextResponse.next();
  if (pathname.startsWith("/admin/login")) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(absoluteUrl(req, "/admin/login"));
  }

  try {
    let secret: Uint8Array;
    try {
      secret = getJwtSecretKey();
    } catch {
      return NextResponse.redirect(absoluteUrl(req, "/admin/login"));
    }
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(absoluteUrl(req, "/admin/login"));
  }
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
