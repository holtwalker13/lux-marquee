import { NextResponse } from "next/server";
import { COOKIE_NAME, getAdminPasscode, signAdminToken } from "@/lib/admin-auth";
import { absoluteUrl } from "@/lib/public-request-origin";

export async function POST(req: Request) {
  const expected = getAdminPasscode();
  if (!expected) {
    return NextResponse.redirect(absoluteUrl(req, "/admin/login?error=1"), { status: 303 });
  }

  let passcode = "";
  try {
    const fd = await req.formData();
    passcode = String(fd.get("passcode") ?? "");
  } catch {
    passcode = "";
  }

  if (passcode.trim() !== expected) {
    return NextResponse.redirect(absoluteUrl(req, "/admin/login?error=1"), { status: 303 });
  }

  const token = await signAdminToken();
  const res = NextResponse.redirect(absoluteUrl(req, "/admin/dashboard"), { status: 303 });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
