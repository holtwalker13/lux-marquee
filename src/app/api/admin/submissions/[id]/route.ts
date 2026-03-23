import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-request";
import { parseMoneyToCents } from "@/lib/money-parse";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  let body: { proposedAmountDollars?: unknown; venmoHandle?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const proposedAmountCents = parseMoneyToCents(body.proposedAmountDollars);
  const venmoHandle =
    body.venmoHandle != null ? String(body.venmoHandle).trim() : undefined;

  const data: {
    proposedAmountCents?: number | null;
    venmoHandle?: string | null;
  } = {};

  if (body.proposedAmountDollars !== undefined) {
    data.proposedAmountCents = proposedAmountCents;
  }
  if (body.venmoHandle !== undefined) {
    data.venmoHandle = venmoHandle || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const updated = await prisma.contactSubmission.update({
      where: { id },
      data,
    });
    return NextResponse.json({ submission: updated });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
