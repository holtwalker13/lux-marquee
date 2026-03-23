import type { ContactSubmission } from "@prisma/client";
import { appendPendingSubmissionRow } from "@/lib/google-sheets";
import { formatUsd } from "@/lib/pricing";

/** Fire-and-forget: log errors only. Tab should exist with matching header row (see README). */
export function queueAppendSubmissionToSheet(sub: ContactSubmission): void {
  void (async () => {
    try {
      const addr = [
        sub.eventAddressLine1,
        sub.eventAddressLine2,
        [sub.eventCity, sub.eventState, sub.eventPostalCode].filter(Boolean).join(", "),
      ]
        .filter(Boolean)
        .join(" · ");

      await appendPendingSubmissionRow([
        sub.createdAt.toISOString(),
        sub.id,
        sub.pipelineStatus,
        sub.contactName,
        sub.contactEmail,
        sub.contactPhone ?? "",
        sub.eventType,
        sub.eventDate.toISOString().slice(0, 10),
        sub.eventTimeLocal,
        sub.eventStartAt?.toISOString() ?? "",
        addr,
        sub.letteringRaw,
        formatUsd(sub.estimatedTotalCents),
        sub.setupOutdoor ? "outdoor" : "indoor",
        sub.outsideServiceRadius ? "yes" : "no",
        sub.distanceMilesFromBase ?? "",
        sub.proposedAmountCents != null && sub.proposedAmountCents > 0
          ? formatUsd(sub.proposedAmountCents)
          : "",
        sub.venmoHandle ?? "",
      ]);
    } catch (e) {
      console.error("[sheets] append failed", e);
    }
  })();
}
