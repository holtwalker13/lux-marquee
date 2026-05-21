import type { AvailabilityIssue } from "@/lib/reservations";

function glyphLabel(letter: string): string {
  if (letter === "0/O") return "0 or O";
  return `“${letter}”`;
}

/** One-line explanation for admin (e.g. only 1× 9 in stock but sign needs 2). */
export function describeAvailabilityIssue(issue: AvailabilityIssue): string {
  const stock = issue.available + issue.inUse;
  const g = glyphLabel(issue.letter);

  if (issue.needed > stock) {
    return `This sign needs ${issue.needed}× ${g}, but you only have ${stock}× in inventory.`;
  }
  if (issue.inUse > 0) {
    return `This sign needs ${issue.needed}× ${g}. You have ${stock}× in stock; ${issue.inUse} already booked on this date — only ${issue.available} left.`;
  }
  return `This sign needs ${issue.needed}× ${g}, but only ${issue.available} available on this date.`;
}

export function describeAvailabilityRejection(issues: AvailabilityIssue[]): string {
  if (issues.length === 0) {
    return "Not enough letter inventory for this date/time window.";
  }
  if (issues.length === 1) return describeAvailabilityIssue(issues[0]!);
  return `Not enough letters for this event date:\n${issues.map((i) => `• ${describeAvailabilityIssue(i)}`).join("\n")}`;
}
