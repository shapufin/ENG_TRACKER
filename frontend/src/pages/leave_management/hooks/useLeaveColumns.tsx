import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Check, X } from "lucide-react";
import type { LeaveRequest } from "@/types";
import type { ColumnDef, CellContext } from "@tanstack/react-table";
import { leaveRequestBaseColumns } from "./leaveColumnsBase";
import { DeleteRequestButton } from "../components/DeleteRequestButton";

export const useLeaveColumns = (
  canApprove: boolean,
  onEdit: (req: LeaveRequest) => void,
  onDelete: (id: number) => void,
  canDelete: (req: LeaveRequest) => boolean,
  onApprove: (id: number) => void,
  onReject: (id: number) => void
): ColumnDef<LeaveRequest>[] =>
  useMemo(
    () => [
      ...leaveRequestBaseColumns<LeaveRequest>(true),
      {
        id: "actions",
        header: "Actions",
        cell: (info: CellContext<LeaveRequest, unknown>) => {
          const row = info.row.original;
          return (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(row)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {canDelete(row) && <DeleteRequestButton id={row.id} onDelete={onDelete} />}
              {canApprove && row.status === "pending" && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-success"
                    onClick={() => onApprove(row.id)}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => onReject(row.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          );
        },
      },
    ],
    [canApprove, onEdit, onDelete, canDelete, onApprove, onReject]
  );
