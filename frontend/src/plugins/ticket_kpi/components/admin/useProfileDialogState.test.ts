import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProfileDialogState } from "./useProfileDialogState";

const profile = {
  name: "P1",
  description: "D1",
  is_active: false,
  is_global: true,
  field_mapping: { ticket_id: "ID" },
  value_transforms: { status: { new: "open" }, priority: { critical: "high" } },
  compute_resolution_time: false,
  compute_sla: true,
  assigned_client_ids: [1, 2],
} as any;

describe("useProfileDialogState", () => {
  it("initializes with profile", async () => {
    const { result } = renderHook(() => useProfileDialogState(true, profile));
    await waitFor(() => expect(result.current.formName).toBe("P1"));
    expect(result.current.formDesc).toBe("D1");
    expect(result.current.formActive).toBe(false);
    expect(result.current.formGlobal).toBe(true);
    expect(result.current.fieldMapping).toEqual({ ticket_id: "ID" });
    expect(result.current.assignedClientIds).toEqual([1, 2]);
    expect(result.current.buildPayload()).toMatchObject({ name: "P1" });
  });

  it("initializes with default values when no profile", async () => {
    const { result } = renderHook(() => useProfileDialogState(true, null));
    await waitFor(() => expect(result.current.formName).toBe(""));
    expect(result.current.formActive).toBe(true);
    expect(result.current.formGlobal).toBe(false);
    expect(result.current.buildPayload().required_fields).toContain("ticket_id");
  });

  it("does not reset when closed", async () => {
    const { result } = renderHook(() => useProfileDialogState(false, null));
    expect(result.current.formName).toBe("");
    expect(result.current.sampleFile).toBeNull();
  });
});
