import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  getAdminPasscode,
  signAdminToken,
} from "@/lib/admin-auth";

export async function POST(req: Request) {
  let body: { passcode?: string };
  try {
    body = (await req.json()) as { passcode?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const expected = getAdminPasscode();
  if (!expected) {
    return NextResponse.json(
      { error: "Set ADMIN_PASSCODE in production to enable admin login." },
      { status: 503 },
    );
  }

  if (String(body.passcode ?? "") !== expected) {
    return NextResponse.json({ error: "Invalid passcode." }, { status: 401 });
  }

  const token = await signAdminToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
