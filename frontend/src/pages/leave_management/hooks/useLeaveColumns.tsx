import { useMemo } from "react";
import type { LeaveRequest } from "@/types";
import type { AppCellContext, AppColumnDef } from "@/components/ui/tableTypes";
import { leaveRequestBaseColumns } from "./leaveColumnsBase";
import { EmployeeLeaveRowActions } from "../components/EmployeeLeaveRowActions";

export const useLeaveColumns = (
  canApprove: boolean,
  onEdit: (req: LeaveRequest) => void,
  onDelete: (id: number) => void,
  canDelete: (req: LeaveRequest) => boolean,
  onApprove: (id: number) => void,
  onReject: (id: number) => void
): AppColumnDef<LeaveRequest>[] =>
  useMemo(
    () => [
      ...leaveRequestBaseColumns<LeaveRequest>(true),
      {
        id: "actions",
        meta: { actionsDisplay: "column" },
        header: "Actions",
        // Sized to the widest row (Approve + Reject + edit + delete icons).
        size: 285,
        cell: (info: AppCellContext<LeaveRequest, unknown>) => (
          <EmployeeLeaveRowActions
            request={info.row.original}
            canApprove={canApprove}
            onEdit={onEdit}
            onDelete={onDelete}
            canDelete={canDelete}
            onApprove={onApprove}
            onReject={onReject}
          />
        ),
      },
    ],
    [canApprove, onEdit, onDelete, canDelete, onApprove, onReject]
  );
