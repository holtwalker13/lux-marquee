import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-request";
import { sendBookingInviteEmail } from "@/lib/calendar-invite";
import { loadLetterInventoryTotals } from "@/lib/inventory-provider";
import { describeAvailabilityRejection } from "@/lib/availability-messages";
import { letteringForInventory } from "@/lib/pricing";
import {
  checkLetterAvailability,
  createReservationsForSubmission,
} from "@/lib/reservations";
import {
  findSubmissionById,
  sheetSubmissionToApiJson,
  updateSubmission,
} from "@/lib/submissions-sheets-store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let bookAnyway = false;
  try {
    const body = (await req.json()) as { bookAnyway?: unknown };
    bookAnyway = body.bookAnyway === true;
  } catch {
    bookAnyway = false;
  }

  const { id } = await ctx.params;
  const sub = await findSubmissionById(id);
  if (!sub) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (sub.pipelineStatus === "cancelled") {
    return NextResponse.json({ error: "This request is cancelled." }, { status: 400 });
  }

  if (sub.pipelineStatus === "booked") {
    const latest = await findSubmissionById(id);
    if (!latest) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({
      submission: sheetSubmissionToApiJson(latest),
      calendarEmailSent: false,
      calendarEmailNote: "Already booked.",
    });
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

  const inventoryLettering = letteringForInventory(
    sub.letteringRaw || sub.letteringNormalized,
  );

  try {
    if (!bookAnyway) {
      const check = await checkLetterAvailability(
        inventoryLettering,
        sub.eventStartAt,
        inventory,
      );
      if (!check.ok) {
        return NextResponse.json(
          {
            error: describeAvailabilityRejection(check.issues),
            issues: check.issues,
          },
          { status: 409 },
        );
      }
    }

    await createReservationsForSubmission(
      sub.id,
      inventoryLettering,
      sub.eventStartAt,
      inventory,
      { bookAnyway },
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
      bookedDespiteInventory: bookAnyway,
    });
  } catch (e) {
    console.error("[confirm-booking]", e);
    const msg = e instanceof Error ? e.message : "Confirm booking failed.";
    const quota =
      msg.includes("Quota exceeded") || msg.includes("RESOURCE_EXHAUSTED");
    return NextResponse.json(
      {
        error: quota
          ? "Google Sheets is rate-limited. Wait a minute and try again."
          : msg,
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      },
      { status: quota ? 503 : 500 },
    );
  }
}
