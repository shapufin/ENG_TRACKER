import { describe, expect, it } from "vitest";
import { Ban, CheckCircle2, CircleDot, Clock } from "lucide-react";
import { hbprRecordState } from "./hbprRecordState";

describe("hbprRecordState", () => {
  it.each([
    ["meetings", "team_meeting", "Team meeting", "neutral"],
    ["meetings", "tl_sync", "TL sync", "info"],
    ["idle-flags", "open", "Open", "warning"],
    ["idle-flags", "resolved", "Resolved", "success"],
    ["absences", "addressed", "Addressed", "success"],
    ["review-deliveries", "delivered", "Delivered", "success"],
    ["pip-records", "draft", "Pending approval", "warning"],
    ["pip-records", "active", "Active", "info"],
    ["pip-records", "completed", "Completed", "success"],
    ["pip-records", "cancelled", "Cancelled", "neutral"],
    ["promotion-flags", "nominated", "Awaiting decision", "warning"],
    ["promotion-flags", "promoted", "Promoted", "success"],
    ["promotion-flags", "declined", "Declined", "neutral"],
  ] as const)("maps %s/%s to %s (%s)", (resource, status, label, tone) => {
    const state = hbprRecordState(resource, status);
    expect(state.label).toBe(label);
    expect(state.tone).toBe(tone);
    expect(state.icon).toBeTruthy();
  });

  it("uses success/CheckCircle2 for resolved and addressed states", () => {
    expect(hbprRecordState("idle-flags", "resolved").icon).toBe(CheckCircle2);
    expect(hbprRecordState("absences", "addressed").icon).toBe(CheckCircle2);
  });

  it("uses Clock for pending states and Ban for declined/cancelled", () => {
    expect(hbprRecordState("pip-records", "draft").icon).toBe(Clock);
    expect(hbprRecordState("promotion-flags", "nominated").icon).toBe(Clock);
    expect(hbprRecordState("idle-flags", "open").icon).toBe(Clock);
    expect(hbprRecordState("promotion-flags", "declined").icon).toBe(Ban);
    expect(hbprRecordState("pip-records", "cancelled").icon).toBe(Ban);
  });

  it("uses CircleDot for informational states", () => {
    expect(hbprRecordState("pip-records", "active").icon).toBe(CircleDot);
    expect(hbprRecordState("meetings", "team_meeting").icon).toBe(CircleDot);
  });

  it("computes absence SLA from the record date like the TL tab (danger past 5 working days)", () => {
    const open = hbprRecordState("absences", "open", "2020-01-01");
    expect(open.tone).toBe("danger");
    expect(open.label).toBe("Over 5 working days open");
    const recent = hbprRecordState("absences", "open", new Date().toISOString().slice(0, 10));
    expect(["warning", "danger"]).toContain(recent.tone);
    expect(recent.label).toMatch(/working days? open/);
  });

  it("never exposes a one_on_one status: unknown meeting types fall back to neutral", () => {
    const state = hbprRecordState("meetings", "one_on_one");
    expect(state.tone).toBe("neutral");
    expect(state.label).toBe("One On One");
  });
});
