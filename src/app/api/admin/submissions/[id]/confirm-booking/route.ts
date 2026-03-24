import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-request";
import { sendBookingInviteEmail } from "@/lib/calendar-invite";
import { loadLetterInventoryTotals } from "@/lib/inventory-provider";
import {
  AvailabilityConflictError,
  checkLetterAvailability,
  createReservationsForSubmission,
} from "@/lib/reservations";
import {
  findSubmissionById,
  sheetSubmissionToApiJson,
  updateSubmission,
} from "@/lib/submissions-sheets-store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const sub = await findSubmissionById(id);
  if (!sub) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (sub.pipelineStatus !== "deposit_paid") {
    return NextResponse.json(
      { error: "Confirm booking only after the deposit is marked paid." },
      { status: 400 },
    );
  }

  if (!sub.eventStartAt) {
    return NextResponse.json(
      { error: "Submission is missing event start time." },
      { status: 400 },
    );
  }

  let inventory: Map<string, number>;
  try {
    inventory = await loadLetterInventoryTotals();
  } catch (e) {
    console.error("[confirm-booking] inventory", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load inventory." },
      { status: 503 },
    );
  }

  const check = await checkLetterAvailability(
    sub.letteringNormalized,
    sub.eventStartAt,
    inventory,
  );
  if (!check.ok) {
    return NextResponse.json(
      {
        error: new AvailabilityConflictError(check.issues).message,
        issues: check.issues,
      },
      { status: 409 },
    );
  }

  await createReservationsForSubmission(
    sub.id,
    sub.letteringNormalized,
    sub.eventStartAt,
  );
  await updateSubmission(id, (p) => ({
    ...p,
    pipelineStatus: "booked",
    bookingConfirmedAt: new Date(),
  }));

  const refreshed = await findSubmissionById(id);
  if (!refreshed) {
    return NextResponse.json({ error: "Not found after update." }, { status: 500 });
  }

  const addressSummary = [
    sub.eventAddressLine1,
    [sub.eventCity, sub.eventState, sub.eventPostalCode].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  const emailResult = await sendBookingInviteEmail({
    eventStartUtc: sub.eventStartAt,
    clientEmail: sub.contactEmail,
    lettering: sub.letteringRaw,
    addressSummary,
  });

  return NextResponse.json({
    submission: sheetSubmissionToApiJson(refreshed),
    calendarEmailSent: emailResult.sent,
    calendarEmailNote: emailResult.reason,
    ics: emailResult.ics,
  });
}
