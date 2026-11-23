import { describe, it, expect } from "vitest";
import { slaBar, slaTone, slaWell } from "./scorecardMeta";

/**
 * The card bands must match the export bands (`plugins/tl_scorecard/report_kpis.py`:
 * `status_for` with `WATCH_SHARE = 0.8`). They once used 90/70, so a 95% month
 * read green on the card and "Watch" in the PDF.
 */
describe("scorecardMeta — status bands", () => {
  it("judges a 100% target at 100 / 80", () => {
    expect(slaTone(100)).toBe("text-tone-success-text");
    expect(slaTone(80)).toBe("text-tone-warning-text");
    expect(slaTone(79)).toBe("text-tone-danger-text");
    // The old 90/70 bands would have called these green.
    expect(slaTone(95)).toBe("text-tone-warning-text");
  });

  it("judges a custom target at the target and 80% of it", () => {
    expect(slaTone(50, 50)).toBe("text-tone-success-text");
    expect(slaTone(40, 50)).toBe("text-tone-warning-text");
    expect(slaTone(39, 50)).toBe("text-tone-danger-text");
    expect(slaBar(50, 50)).toBe("bg-tone-success-text");
    expect(slaBar(40, 50)).toBe("bg-tone-warning-text");
    expect(slaBar(39, 50)).toBe("bg-tone-danger-text");
  });

  it("keeps the icon well and the bar in step with the text tone", () => {
    expect(slaWell(100)).toContain("border-tone-success-border");
    expect(slaWell(80)).toContain("border-tone-warning-border");
    expect(slaWell(79)).toContain("border-tone-danger-border");
    expect(slaBar(100)).toBe("bg-tone-success-text");
    expect(slaBar(80)).toBe("bg-tone-warning-text");
    expect(slaBar(79)).toBe("bg-tone-danger-text");
  });

  it("treats no data as neutral, never as a failure", () => {
    expect(slaTone(null)).toBeUndefined();
    expect(slaWell(null)).toContain("border-tone-neutral-border");
    expect(slaBar(null)).toBe("bg-muted-foreground/40");
  });
});
