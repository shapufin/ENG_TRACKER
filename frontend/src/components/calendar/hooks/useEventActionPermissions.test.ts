import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEventActionPermissions } from "./useEventActionPermissions";
import type { CalendarEvent } from "../types";

const baseEvent: CalendarEvent = {
  id: "1",
  title: "Event",
  start: "2024-06-15",
  end: "2024-06-15",
  type: "vacation",
  status: "pending",
  userId: 1,
  userName: "Alice",
  compactLabel: "VAC",
};

const run = (
  event: Partial<CalendarEvent>,
  currentUser: { id: number } | null,
  canViewTeamData: boolean
) =>
  renderHook(() =>
    useEventActionPermissions({
      event: { ...baseEvent, ...event } as CalendarEvent,
      currentUser,
      canViewTeamData,
    })
  ).result.current;

describe("useEventActionPermissions", () => {
  it("allows own edit/delete for pending vacation", () => {
    const result = run({ type: "vacation", status: "pending" }, { id: 1 }, false);
    expect(result.showEdit).toBe(true);
    expect(result.showDelete).toBe(true);
    expect(result.showApprovalActions).toBe(false);
    expect(result.showNoActionsMessage).toBe(false);
  });

  it("does not allow editing standby entries", () => {
    const result = run({ type: "standby", status: "pending" }, { id: 1 }, false);
    expect(result.showEdit).toBe(false);
    expect(result.showDelete).toBe(true);
  });

  it("blocks all actions on holidays", () => {
    const result = run({ type: "holiday", status: "approved" }, { id: 1 }, false);
    expect(result.showEdit).toBe(false);
    expect(result.showDelete).toBe(false);
    expect(result.showApprovalActions).toBe(false);
    expect(result.showNoActionsMessage).toBe(false);
    expect(result.isHoliday).toBe(true);
  });

  it("allows team leader to approve/reject pending vacation", () => {
    const result = run({ type: "vacation", status: "pending", userId: 2 }, { id: 1 }, true);
    expect(result.showApprovalActions).toBe(true);
    expect(result.showDelete).toBe(true);
    expect(result.showEdit).toBe(false);
  });

  it("blocks team leader from approving their own events", () => {
    const result = run({ type: "vacation", status: "pending", userId: 1 }, { id: 1 }, true);
    expect(result.showApprovalActions).toBe(false);
    expect(result.showEdit).toBe(true);
  });

  it("blocks team leader approval for sick leave", () => {
    const result = run({ type: "sick", status: "pending", userId: 2 }, { id: 1 }, true);
    expect(result.showApprovalActions).toBe(false);
    expect(result.showDelete).toBe(true);
    expect(result.isSick).toBe(true);
  });

  it("shows no actions message for non-TL user viewing another non-holiday event", () => {
    const result = run({ type: "vacation", status: "approved", userId: 2 }, { id: 1 }, false);
    expect(result.showNoActionsMessage).toBe(true);
    expect(result.showEdit).toBe(false);
    expect(result.showDelete).toBe(false);
  });

  it("treats missing currentUser as non-owner", () => {
    const result = run({ type: "vacation", status: "pending", userId: 1 }, null, false);
    expect(result.isOwnRecord).toBeFalsy();
    expect(result.showNoActionsMessage).toBe(true);
  });

  it("identifies pending status", () => {
    const result = run({ status: "pending" }, { id: 1 }, true);
    expect(result.isPending).toBe(true);
  });
});
