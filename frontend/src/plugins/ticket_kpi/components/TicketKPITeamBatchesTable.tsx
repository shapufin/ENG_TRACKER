import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RowActions, type RowAction } from "@/components/ui/RowActions";
import { Eye, Trash2, CheckCircle2, Undo2 } from "lucide-react";
import { formatMonthLabel } from "@/lib/monthOptions";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import type { BatchRow } from "../pages/hooks/useTicketKPITeamManagement";

interface TicketKPITeamBatchesTableProps {
  rows: BatchRow[];
  isLoading: boolean;
  onDelete: (batch: BatchRow) => void;
  onReview: (batch: BatchRow) => void;
  onUnreview: (batch: BatchRow) => void;
  /** Whether the viewer may take this batch's review back (server enforces it too). */
  canUnreview: (batch: BatchRow) => boolean;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
}

export const TicketKPITeamBatchesTable: React.FC<TicketKPITeamBatchesTableProps> = ({
  rows,
  isLoading,
  onDelete,
  onReview,
  onUnreview,
  canUnreview,
  rowSelection,
  onRowSelectionChange,
}) => {
  const navigate = useNavigate();

  // No manual "select" column here: DataTable renders its own select-all
  // header checkbox and per-row checkbox whenever enableRowSelection is
  // true (see DataTable.tsx); a second column defining the same thing
  // rendered two checkboxes per row. See ControlRoomAccessPage.tsx for the
  // same enableRowSelection-only pattern.
  const columns = useMemo<AppColumnDef<BatchRow>[]>(
    () => [
      {
        accessorKey: "user_name",
        header: "User",
        cell: ({ row }) => <div className="font-medium">{row.original.user_name}</div>,
      },
      {
        accessorKey: "month",
        header: "Month",
        cell: ({ row }) => formatMonthLabel(row.original.month),
      },
      {
        accessorKey: "profile_name",
        header: "Profile",
        cell: ({ row }) => row.original.profile_name || `Profile ${row.original.profile}`,
      },
      {
        accessorKey: "record_count",
        header: "Records",
      },
      {
        accessorKey: "created_at",
        header: "Imported",
        cell: ({ row }) => (
          <div>
            {row.original.created_at
              ? formatDateDDMMYYYY(row.original.created_at.slice(0, 10))
              : "N/A"}
            {row.original.uploaded_by_username ? (
              <div className="text-muted-foreground text-xs">
                by {row.original.uploaded_by_username}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: "reviewed",
        header: "Reviewed",
        cell: ({ row }) =>
          row.original.is_reviewed ? (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {row.original.reviewed_by_username || "Yes"}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">Not reviewed</span>
          ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const batch = row.original;
          const who = batch.user_name || `user ${batch.user}`;
          const reviewAction: RowAction | null = batch.is_reviewed
            ? canUnreview(batch)
              ? {
                  label: `Undo review for ${who}`,
                  shortLabel: "Undo review",
                  icon: Undo2,
                  tone: "warning",
                  onClick: () => onUnreview(batch),
                }
              : null
            : {
                label: `Review upload for ${who}`,
                shortLabel: "Review",
                icon: CheckCircle2,
                tone: "success",
                onClick: () => onReview(batch),
              };
          const actions: RowAction[] = [
            {
              label: `View member dashboard for ${who}`,
              icon: Eye,
              onClick: () =>
                navigate(`/ticket-kpi/dashboard?user_id=${batch.user}&month=${batch.month}`),
            },
            ...(reviewAction ? [reviewAction] : []),
            {
              label: `Delete upload for ${who}`,
              icon: Trash2,
              tone: "danger",
              onClick: () => onDelete(batch),
            },
          ];
          return <RowActions actions={actions} />;
        },
      },
    ],
    [navigate, onDelete, onReview, onUnreview, canUnreview]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Imports</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={rows}
          searchColumn="user_name"
          searchPlaceholder="Search team member..."
          pageSize={10}
          emptyMessage={isLoading ? "Loading..." : "No team imports found."}
          getRowId={(row) => String(row.id)}
          enableRowSelection
          rowSelection={rowSelection}
          onRowSelectionChange={onRowSelectionChange}
          mobileCard={{
            title: "user_name",
            hero: "record_count",
            meta: ["month", "profile_name", "created_at", "reviewed"],
          }}
        />
      </CardContent>
    </Card>
  );
};
