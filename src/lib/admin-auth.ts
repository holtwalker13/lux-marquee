import { SignJWT, jwtVerify } from "jose";

export const COOKIE_NAME = "lux_admin";

export function getJwtSecretKey(): Uint8Array {
  const s = process.env.ADMIN_JWT_SECRET?.trim();
  if (s && s.length >= 16) return new TextEncoder().encode(s);
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode("dev-lux-admin-secret");
  }
  throw new Error("ADMIN_JWT_SECRET must be set (min 16 characters) in production.");
}

export function getAdminPasscode(): string {
  const p = process.env.ADMIN_PASSCODE?.trim();
  if (p) return p;
  if (process.env.NODE_ENV === "production") return "";
  return "rekab";
}

export async function signAdminToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getJwtSecretKey());
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getJwtSecretKey());
    return true;
  } catch {
    return false;
  }
}
