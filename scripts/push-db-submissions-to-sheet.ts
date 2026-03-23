/**
 * Appends every ContactSubmission in the local DB to SubmitRequests (same columns as live form appends).
 * Use after `npx prisma db seed` to mirror mock rows in the sheet.
 * Re-running appends duplicates — clear sheet data rows first if you need a fresh copy.
 *
 * Run: npm run sheets:push-submissions
 */
import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { isGoogleSheetsConfigured, appendPendingSubmissionRows } = await import(
    "../src/lib/google-sheets"
  );
  const { contactSubmissionToSheetValues } = await import(
    "../src/lib/append-submission-sheet"
  );

  if (!isGoogleSheetsConfigured()) {
    console.error(
      "Set GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY in .env",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  let subs;
  try {
    subs = await prisma.contactSubmission.findMany({
      orderBy: { createdAt: "asc" },
    });
  } finally {
    await prisma.$disconnect();
  }

  if (subs.length === 0) {
    console.error("No rows in ContactSubmission. Run: npx prisma db seed");
    process.exit(2);
  }

  const rows = subs.map((s) => contactSubmissionToSheetValues(s));
  await appendPendingSubmissionRows(rows);
  console.log(`OK: Appended ${rows.length} row(s) to SubmitRequests.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
