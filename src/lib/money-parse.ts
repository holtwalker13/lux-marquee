export function parseMoneyToCents(input: unknown): number | null {
  if (input === "" || input === null || input === undefined) return null;
  const s = String(input).trim().replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
