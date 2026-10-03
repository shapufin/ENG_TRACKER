import type { KindConfig, RecordRow } from "./recordKinds";

export interface RecordStrip {
  total: number;
  /** warning/danger states: open flags, unaddressed absences, awaiting decisions. */
  attention: number;
  /** success states: shared, resolved, addressed, delivered, completed. */
  done: number;
  /** done/total as a real 0-100 ratio (0 when empty, never NaN). */
  donePct: number;
}

/**
 * Honest per-kind summary from already-loaded rows: attention and done are
 * derived from the same state tones the table badges render, so the strip can
 * never disagree with the list below it.
 */
export const recordStripStats = (config: KindConfig<RecordRow>, rows: RecordRow[]): RecordStrip => {
  let attention = 0;
  let done = 0;
  for (const row of rows) {
    const tone = config.state(row).tone;
    if (tone === "warning" || tone === "danger") attention += 1;
    if (tone === "success") done += 1;
  }
  return {
    total: rows.length,
    attention,
    done,
    donePct: rows.length === 0 ? 0 : Math.round((done / rows.length) * 100),
  };
};
