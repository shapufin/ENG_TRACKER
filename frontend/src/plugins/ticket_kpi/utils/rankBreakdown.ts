export interface RankedRow {
  label: string;
  count: number;
  /** Whole-number share of the total; the rows always add up to 100. */
  percent: number;
  /** True for the folded "Other" row. */
  folded?: boolean;
}

/**
 * Sorts a `{label: count}` breakdown by count, keeps the top `limit` rows and
 * folds the remainder into one "Other" row, so a column with 200 distinct
 * values stays readable. Percentages use the largest-remainder method so they
 * add up to exactly 100.
 */
export function rankBreakdown(data: Record<string, number>, limit: number): RankedRow[] {
  const entries = Object.entries(data)
    .map(([label, count]) => ({ label, count: Number(count) }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  if (total === 0) return [];

  const kept = entries.slice(0, limit);
  const rest = entries.slice(limit);
  const rows: RankedRow[] = kept.map((e) => ({ ...e, percent: 0 }));
  if (rest.length > 0) {
    rows.push({
      label: "Other",
      count: rest.reduce((sum, e) => sum + e.count, 0),
      percent: 0,
      folded: true,
    });
  }

  const exact = rows.map((r) => (r.count / total) * 100);
  rows.forEach((r, i) => (r.percent = Math.floor(exact[i])));
  let missing = 100 - rows.reduce((sum, r) => sum + r.percent, 0);
  const byRemainder = exact
    .map((value, i) => ({ i, rem: value - Math.floor(value) }))
    .sort((a, b) => b.rem - a.rem);
  for (const { i } of byRemainder) {
    if (missing <= 0) break;
    rows[i].percent += 1;
    missing -= 1;
  }
  return rows;
}

const signature = (data: Record<string, number>): string =>
  JSON.stringify(
    Object.entries(data)
      .map(([label, count]) => [label.trim().toLowerCase(), Number(count)] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  );

/**
 * Drops a field whose values and counts are identical to a field that is
 * already on screen (`alreadyShown` names keys of `all`) or to an earlier field
 * in `all`. Exports often carry the same column twice under two names ("Analyst"
 * next to the assignee, "Validator" next to "Driver Group"); each would chart as
 * a duplicate. Labels are compared case-insensitively.
 */
export function dropRepeatedBreakdowns(
  all: Record<string, Record<string, number>>,
  alreadyShown: string[]
): Record<string, Record<string, number>> {
  const seen = new Set(
    alreadyShown.filter((key) => all[key]).map((key) => signature(all[key]))
  );
  const result: Record<string, Record<string, number>> = {};
  for (const [key, data] of Object.entries(all)) {
    if (alreadyShown.includes(key)) continue;
    const sig = signature(data);
    if (seen.has(sig)) continue;
    seen.add(sig);
    result[key] = data;
  }
  return result;
}
