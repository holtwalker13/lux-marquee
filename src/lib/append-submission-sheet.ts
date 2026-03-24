import { appendPendingSubmissionRow } from "@/lib/google-sheets";
import { sheetSubmissionToRowValues, type SheetSubmission } from "@/lib/submission-sheet-schema";

/** Fire-and-forget append (e.g. duplicate log). Prefer awaited `appendSubmission` in store for correctness. */
export function queueAppendSubmissionToSheet(sub: SheetSubmission): void {
  void (async () => {
    try {
      await appendPendingSubmissionRow(sheetSubmissionToRowValues(sub));
    } catch (e) {
      console.error("[sheets] append failed", e);
    }
  })();
}
