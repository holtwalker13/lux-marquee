import { randomUUID } from "crypto";
import {
  fetchSubmitRequestsGrid,
  updateSubmitRequestsRow,
  appendPendingSubmissionRow,
} from "@/lib/google-sheets";
import {
  parseSubmissionRow,
  sheetSubmissionToApiJson,
  sheetSubmissionToRowValues,
  type SheetSubmission,
} from "@/lib/submission-sheet-schema";

function gridDataRows(grid: string[][]): { header: string[]; dataRows: string[][] } {
  if (grid.length < 2) return { header: grid[0] ?? [], dataRows: [] };
  return { header: grid[0] ?? [], dataRows: grid.slice(1) };
}

/** 1-based sheet row number for a data row at dataRows[index]. */
function sheetRowIndex(dataRowIndex: number): number {
  return dataRowIndex + 2;
}

export async function listSubmissionsParsed(): Promise<SheetSubmission[]> {
  const grid = await fetchSubmitRequestsGrid();
  const { dataRows } = gridDataRows(grid);
  const out: SheetSubmission[] = [];
  for (const row of dataRows) {
    const sub = parseSubmissionRow(row.map((c) => String(c ?? "")));
    if (sub) out.push(sub);
  }
  return out;
}

export async function listSubmissionsApiJson() {
  const list = await listSubmissionsParsed();
  return list.map(sheetSubmissionToApiJson);
}

export async function findSubmissionById(id: string): Promise<SheetSubmission | null> {
  const grid = await fetchSubmitRequestsGrid();
  const { dataRows } = gridDataRows(grid);
  for (const row of dataRows) {
    const cells = row.map((c) => String(c ?? ""));
    const sub = parseSubmissionRow(cells);
    if (sub && sub.id === id) return sub;
  }
  return null;
}

export async function findSubmissionRowIndex1Based(id: string): Promise<number | null> {
  const grid = await fetchSubmitRequestsGrid();
  const { dataRows } = gridDataRows(grid);
  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i].map((c) => String(c ?? ""));
    const sub = parseSubmissionRow(cells);
    if (sub && sub.id === id) return sheetRowIndex(i);
  }
  return null;
}

export async function appendSubmission(sub: SheetSubmission): Promise<void> {
  const values = sheetSubmissionToRowValues(sub);
  await appendPendingSubmissionRow(values);
}

export async function updateSubmission(
  id: string,
  mutator: (prev: SheetSubmission) => SheetSubmission,
): Promise<SheetSubmission | null> {
  const rowNum = await findSubmissionRowIndex1Based(id);
  if (rowNum == null) return null;
  const prev = await findSubmissionById(id);
  if (!prev) return null;
  const next = mutator(prev);
  if (next.id !== id) throw new Error("Cannot change submission id.");
  await updateSubmitRequestsRow(rowNum, sheetSubmissionToRowValues(next));
  return next;
}

export function createNewSubmissionId(): string {
  return randomUUID();
}

export { sheetSubmissionToApiJson, type SheetSubmission };
