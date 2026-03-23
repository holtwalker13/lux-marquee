import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/admin-auth";

export default async function AdminIndexPage() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (token && (await verifyAdminToken(token))) {
    redirect("/admin/dashboard");
  }
  redirect("/admin/login");
}
