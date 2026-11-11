import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTeamColumns } from "./useTeamColumns";

const noopMut = { mutate: vi.fn(), isPending: false };

describe("useTeamColumns", () => {
  it("distributes flex sizing across all data columns rather than only Employee", () => {
    const { result } = renderHook(() =>
      useTeamColumns(vi.fn(), vi.fn(), noopMut, noopMut, noopMut, noopMut, noopMut, noopMut)
    );

    const sets = [
      result.current.getOvertimeColumns,
      result.current.getStandbyColumns,
      result.current.getLeaveColumns,
    ];

    for (const columns of sets) {
      const dataColumns = columns.filter((col) => col.id !== "actions");
      const actionsCol = columns.find((col) => col.id === "actions");

      expect(dataColumns.length).toBeGreaterThan(1);
      for (const col of dataColumns) {
        expect(col.meta?.flex).toBe(true);
        expect(typeof col.header).toBe("string");
      }
      expect(actionsCol?.meta?.actionsDisplay).toBe("column");
    }
  });
});
