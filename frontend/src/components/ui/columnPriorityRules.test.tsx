import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, renderHook } from "@testing-library/react";
import type { AppColumnDef } from "@/components/ui/tableTypes";

/*
 * One rule for every annotated table (see Task 7 brief):
 *   1 = person/name, date, status, hours/days, actions
 *   2 = type, client, team, assignments the reader still needs
 *   3 = description/reason (also truncate), tickets, payroll period, blocks,
 *       code, email, timestamps, carry-over/expiry, Manager/Line Manager columns
 * A priority column needs an explicit `id`, or the fit cannot resolve it.
 */

const captured: { columns: AppColumnDef<never>[] }[] = [];
vi.mock("@/components/ui/DataTable", () => ({
  DataTable: (props: { columns: AppColumnDef<never>[] }) => {
    captured.push({ columns: props.columns });
    return null;
  },
}));

import { useTeamColumns } from "@/pages/team/hooks/useTeamColumns";
import { useTLApprovalColumns } from "@/pages/team/hooks/useTLApprovalColumns";
import { useOvertimeColumns } from "@/pages/overtime/hooks/useOvertimeColumns";
import { useStandbyColumns } from "@/pages/standby/hooks/useStandbyColumns";
import { useUserColumns } from "@/pages/admin/hooks/useUserColumns";
import { useHbprAssignmentColumns } from "@/pages/admin/hooks/useHbprAssignmentColumns";
import { useLeaveBalanceColumns } from "@/pages/admin/hooks/useLeaveBalanceColumns";
import { LeaveRequestsTable } from "@/pages/admin/components/LeaveRequestsTable";
import { HoursLogsTable } from "@/pages/admin/components/HoursLogsTable";
import { timeRangeColumn } from "@/pages/admin/components/standbyColumns";

type Cols = AppColumnDef<never>[];
const noop = vi.fn();
const mut = { mutate: noop, isPending: false };
const server = { search: "", onSearchChange: noop, page: 1, total: 0, onPageChange: noop };

const fromLeaveTable = (): Cols => {
  captured.length = 0;
  render(
    React.createElement(LeaveRequestsTable, {
      requests: [],
      server: server as never,
      onApprove: noop,
      onReject: noop,
    })
  );
  return captured[0].columns;
};
const fromHoursTable = (): Cols => {
  captured.length = 0;
  render(
    React.createElement(HoursLogsTable, {
      logs: [],
      server: server as never,
      extraColumns: [timeRangeColumn as never],
      onApprove: noop,
      onReject: noop,
      storageKey: "k",
    })
  );
  return captured[0].columns;
};

const tables = (): Record<string, Cols> => {
  const team = renderHook(() => useTeamColumns(noop, noop, mut, mut, mut, mut, mut, mut, true))
    .result.current;
  const tl = renderHook(() =>
    useTLApprovalColumns({ onView: noop, onApprove: noop, onReject: noop })
  ).result.current;
  return {
    "team overtime": team.getOvertimeColumns as Cols,
    "team standby": team.getStandbyColumns as Cols,
    "team leave": team.getLeaveColumns as Cols,
    "approval overtime": tl.overtimeColumns as Cols,
    "approval standby": tl.standbyColumns as Cols,
    "approval leave": tl.leaveColumns as Cols,
    "my overtime": renderHook(() =>
      useOvertimeColumns(true, true, noop, noop, noop, noop)
    ).result.current.map((c) => c) as Cols,
    "my standby": renderHook(() => useStandbyColumns(true, true, noop, noop, noop, noop)).result
      .current as Cols,
    users: renderHook(() =>
      useUserColumns(noop, noop, noop, { crActive: true })
    ).result.current.map((c) => c) as Cols,
    hbpr: renderHook(() => useHbprAssignmentColumns(noop, noop)).result.current as Cols,
    "leave balances": renderHook(() => useLeaveBalanceColumns(noop, noop)).result.current as Cols,
    "admin leave requests": fromLeaveTable(),
    "admin hours logs": fromHoursTable(),
  };
};

const colId = (c: AppColumnDef<never>) => c.id ?? (c as { accessorKey?: string }).accessorKey ?? "";

describe("column priority rules", () => {
  const all = tables();

  it("every annotated table marks actions, select and status priority 1 and description priority 3 + truncate", () => {
    for (const [name, columns] of Object.entries(all)) {
      for (const c of columns) {
        const id = colId(c);
        const where = `${name}/${id}`;
        if (id === "actions") expect(c.meta?.priority, where).toBe(1);
        if (id === "status" || id === "cadence_status") expect(c.meta?.priority, where).toBe(1);
        if (id === "description" || id === "reason") {
          expect(c.meta?.priority, where).toBe(3);
          expect(c.meta?.truncate, where).toBe(true);
        }
      }
    }
  });

  it("gives every column an explicit id and a priority", () => {
    for (const [name, columns] of Object.entries(all)) {
      for (const c of columns) {
        expect(c.id, `${name}/${colId(c)} id`).toBeTruthy();
        expect(c.meta?.priority, `${name}/${c.id} priority`).toBeDefined();
      }
    }
  });

  it("ranks person, dates and hours 1; type, client and team 2; tickets, payroll, code, email 3", () => {
    const expected: Record<string, 1 | 2 | 3> = {
      user_name: 1,
      user_full_name: 1,
      username: 1,
      date: 1,
      start_date: 1,
      end_date: 1,
      dates: 1,
      hours: 1,
      days: 1,
      days_requested: 1,
      client_name: 2,
      request_type: 2,
      type: 2,
      team: 2,
      ticket_references: 3,
      payroll_period: 3,
      blocks: 3,
      code: 3,
      email: 3,
      it_tl_assigned: 3,
      al_tl_assigned: 3,
      expires_at: 3,
      is_carry_over: 3,
    };
    for (const [name, columns] of Object.entries(all)) {
      for (const c of columns) {
        const want = expected[c.id ?? ""];
        if (want) expect(c.meta?.priority, `${name}/${c.id}`).toBe(want);
      }
    }
  });

  it("sizes every column explicitly so the fit estimate matches", () => {
    for (const [name, columns] of Object.entries(all)) {
      for (const c of columns) {
        if (c.id === "actions" && name === "users") continue; // sized by its icons
        expect(c.size, `${name}/${c.id} size`).toBeGreaterThan(0);
      }
    }
  });
});
