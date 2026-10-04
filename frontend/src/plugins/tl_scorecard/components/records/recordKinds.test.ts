import { describe, expect, it } from "vitest";
import { KIND_ICONS, RECORD_CONFIGS, workingDaysOpen, type RecordKind } from "./recordKinds";

const byKey = (key: RecordKind) => RECORD_CONFIGS.find((c) => c.key === key)!;

describe("recordKind person/focus/typeChip", () => {
  it("names the meeting counterparty, falling back to the whole team", () => {
    const config = byKey("meetings");
    expect(config.person({ counterparty_name: "Aldair" } as never)).toBe("Aldair");
    expect(config.person({ counterparty_name: null } as never)).toBe("Whole team");
  });

  it("labels meeting types for the type chip", () => {
    const config = byKey("meetings");
    expect(config.typeChip({ meeting_type: "one_on_one" } as never)).toBe("1-on-1");
    expect(config.typeChip({ meeting_type: "tl_sync" } as never)).toBe("TL sync");
  });

  it("prefers the shared summary for the meeting focus, then notes", () => {
    const config = byKey("meetings");
    expect(config.focus({ shared_summary: "Shared", notes: "Private" } as never)).toBe("Shared");
    expect(config.focus({ shared_summary: "", notes: "Private" } as never)).toBe("Private");
    expect(config.focus({ shared_summary: "", notes: "" } as never)).toBeNull();
  });

  it("joins idle task and notes, absence reason and notes", () => {
    expect(byKey("idle").focus({ productivity_task: "Docs", notes: "" } as never)).toBe("Docs");
    expect(byKey("idle").focus({ productivity_task: "", notes: "Slow week" } as never)).toBe(
      "Slow week"
    );
    expect(byKey("absences").focus({ reason: "Sick", notes: "" } as never)).toBe("Sick");
    expect(byKey("absences").person({ employee_name: null } as never)).toBe("Unknown");
  });

  it("uses fixed type chips for single-type kinds and the period for reviews", () => {
    expect(byKey("idle").typeChip({} as never)).toBe("Idle flag");
    expect(byKey("absences").typeChip({} as never)).toBe("Absence");
    expect(byKey("reviews").typeChip({ period: "2026-Q3" } as never)).toBe("2026-Q3");
    expect(byKey("promotions").typeChip({} as never)).toBe("Nomination");
    expect(byKey("pips").typeChip({} as never)).toBe("PIP");
  });

  it("surfaces decision and status notes for promotions and PIPs", () => {
    expect(byKey("promotions").focus({ decision_note: "Strong", notes: "" } as never)).toBe(
      "Strong"
    );
    expect(byKey("pips").focus({ status_note: "", notes: "Check in weekly" } as never)).toBe(
      "Check in weekly"
    );
    expect(byKey("reviews").person({ recipient: "Elena" } as never)).toBe("Elena");
  });

  it("maps every kind to an icon and tone", () => {
    for (const config of RECORD_CONFIGS) {
      expect(KIND_ICONS[config.key].icon).toBeTruthy();
      expect(KIND_ICONS[config.key].tone).toMatch(/success|warning|info|accent|danger/);
    }
  });
});

// Mirrors the backend: weekdays inclusive between the dates, minus one
// (`count_business_days(start, today) - 1` in plugins/tl_scorecard/services.py).
describe("workingDaysOpen", () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00`);

  it("is zero on the day itself", () => {
    expect(workingDaysOpen("2026-10-05", at("2026-10-05"))).toBe(0);
  });

  it("does not count a weekend as time open", () => {
    // Fri 2026-10-02 -> Mon 2026-10-05: three calendar days, one working day.
    expect(workingDaysOpen("2026-10-02", at("2026-10-05"))).toBe(1);
  });

  it("reaches five a week later and passes the 5-day SLA the day after", () => {
    expect(workingDaysOpen("2026-10-05", at("2026-10-12"))).toBe(5);
    expect(workingDaysOpen("2026-10-05", at("2026-10-13"))).toBe(6);
  });

  it("never goes negative for a future date", () => {
    expect(workingDaysOpen("2026-10-09", at("2026-10-05"))).toBe(0);
  });
});
