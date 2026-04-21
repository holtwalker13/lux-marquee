import { SignJWT, jwtVerify } from "jose";
import { getJwtSecretKey } from "@/lib/admin-auth";

const PURPOSE = "rental_agreement_sign";

export async function signRentalAgreementJwt(submissionId: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(submissionId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getJwtSecretKey());
}

/** Returns submission id, or null if invalid/expired. */
export async function verifyRentalAgreementJwt(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    if (payload.purpose !== PURPOSE) return null;
    const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
    return sub || null;
  } catch {
    return null;
  }
}
