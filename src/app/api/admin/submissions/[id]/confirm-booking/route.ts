import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-request";
import { sendBookingInviteEmail } from "@/lib/calendar-invite";
import { loadLetterInventoryTotals } from "@/lib/inventory-provider";
import {
  AvailabilityConflictError,
  checkLetterAvailability,
  createReservationsForSubmission,
} from "@/lib/reservations";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const sub = await prisma.contactSubmission.findUnique({ where: { id } });
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

  const inventory = await loadLetterInventoryTotals(prisma);

  try {
    await prisma.$transaction(async (tx) => {
      const check = await checkLetterAvailability(
        tx as unknown as PrismaClient,
        sub.letteringNormalized,
        sub.eventStartAt!,
        inventory,
      );
      if (!check.ok) {
        throw new AvailabilityConflictError(check.issues);
      }
      await createReservationsForSubmission(
        tx as unknown as PrismaClient,
        sub.id,
        sub.letteringNormalized,
        sub.eventStartAt!,
      );
      await tx.contactSubmission.update({
        where: { id: sub.id },
        data: {
          pipelineStatus: "booked",
          bookingConfirmedAt: new Date(),
        },
      });
    });
  } catch (e) {
    if (e instanceof AvailabilityConflictError) {
      return NextResponse.json(
        { error: e.message, issues: e.issues },
        { status: 409 },
      );
    }
    throw e;
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

  const updated = await prisma.contactSubmission.findUnique({ where: { id } });

  return NextResponse.json({
    submission: updated,
    calendarEmailSent: emailResult.sent,
    calendarEmailNote: emailResult.reason,
    ics: emailResult.ics,
  });
}
