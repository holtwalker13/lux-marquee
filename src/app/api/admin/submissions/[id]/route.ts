import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-request";
import { parseMoneyToCents } from "@/lib/money-parse";
import {
  sheetSubmissionToApiJson,
  updateSubmission,
} from "@/lib/submissions-sheets-store";

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

  const hasProposed = body.proposedAmountDollars !== undefined;
  const hasVenmo = body.venmoHandle !== undefined;

  if (!hasProposed && !hasVenmo) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await updateSubmission(id, (prev) => ({
    ...prev,
    ...(hasProposed ? { proposedAmountCents } : {}),
    ...(hasVenmo ? { venmoHandle: venmoHandle || null } : {}),
  }));

  if (!updated) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ submission: sheetSubmissionToApiJson(updated) });
}
