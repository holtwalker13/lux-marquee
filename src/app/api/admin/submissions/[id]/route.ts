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
  let body: {
    proposedAmountDollars?: unknown;
    venmoHandle?: unknown;
    bookingTasks?: unknown;
    pipelineStatus?: unknown;
  };
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
  const hasBookingTasks = body.bookingTasks !== undefined;
  const hasPipelineStatus = body.pipelineStatus !== undefined;

  let pipelineStatus: "pending_request" | "deposit_requested" | "deposit_paid" | "booked" | "cancelled" | "archived" | undefined;
  if (hasPipelineStatus) {
    const raw = String(body.pipelineStatus ?? "").trim();
    const allowed = new Set([
      "pending_request",
      "deposit_requested",
      "deposit_paid",
      "booked",
      "cancelled",
      "archived",
    ]);
    if (!allowed.has(raw)) {
      return NextResponse.json(
        { error: "Invalid pipelineStatus value." },
        { status: 400 },
      );
    }
    pipelineStatus = raw as typeof pipelineStatus;
  }

  let bookingTasks:
    | {
        calendarCreated?: boolean;
        welcomeSent?: boolean;
        contractSent?: boolean;
        balancePaid?: boolean;
      }
    | undefined;
  if (hasBookingTasks) {
    if (
      body.bookingTasks == null ||
      typeof body.bookingTasks !== "object" ||
      Array.isArray(body.bookingTasks)
    ) {
      return NextResponse.json({ error: "bookingTasks must be an object." }, { status: 400 });
    }
    const raw = body.bookingTasks as Record<string, unknown>;
    bookingTasks = {};
    for (const key of ["calendarCreated", "welcomeSent", "contractSent", "balancePaid"] as const) {
      if (raw[key] !== undefined) {
        if (typeof raw[key] !== "boolean") {
          return NextResponse.json(
            { error: `bookingTasks.${key} must be a boolean.` },
            { status: 400 },
          );
        }
        bookingTasks[key] = raw[key];
      }
    }
  }

  if (!hasProposed && !hasVenmo && !hasBookingTasks && !hasPipelineStatus) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await updateSubmission(id, (prev) => {
    let existingMeta: Record<string, unknown> = {};
    if (hasBookingTasks && prev.metadata?.trim()) {
      try {
        const parsed = JSON.parse(prev.metadata) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          existingMeta = parsed as Record<string, unknown>;
        }
      } catch {
        existingMeta = {};
      }
    }

    return {
      ...prev,
      ...(hasProposed ? { proposedAmountCents } : {}),
      ...(hasVenmo ? { venmoHandle: venmoHandle || null } : {}),
      ...(hasPipelineStatus ? { pipelineStatus } : {}),
      ...(hasBookingTasks
        ? {
            metadata: JSON.stringify({
              ...existingMeta,
              bookingTasks: {
                ...(typeof existingMeta.bookingTasks === "object" &&
                existingMeta.bookingTasks &&
                !Array.isArray(existingMeta.bookingTasks)
                  ? (existingMeta.bookingTasks as Record<string, unknown>)
                  : {}),
                ...bookingTasks,
              },
            }),
          }
        : {}),
    };
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ submission: sheetSubmissionToApiJson(updated) });
}
