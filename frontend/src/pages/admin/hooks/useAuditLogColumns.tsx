/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { Eye } from "lucide-react";
import { RowActions } from "@/components/ui/RowActions";
import type { AuditLog } from "@/services/auditService";

// fallow-ignore-next-line complexity
const getActionColor = (action: string) => {
  if (action.includes("create") || action.includes("add")) return "bg-primary/10 text-foreground";
  if (action.includes("update") || action.includes("edit")) return "bg-warning/10 text-warning";
  if (action.includes("delete") || action.includes("remove"))
    return "bg-destructive/10 text-destructive";
  return "bg-primary/10 text-foreground";
};

const timestampFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export const useAuditLogColumns = (onView: (log: AuditLog) => void) =>
  useMemo(
    () => [
      {
        header: "Timestamp",
        accessorKey: "timestamp",
        cell: (info: any) => (
          <div
            className="text-muted-foreground text-sm whitespace-nowrap"
            title={new Date(info.getValue()).toLocaleString()}
          >
            {timestampFormat.format(new Date(info.getValue()))}
          </div>
        ),
      },
      {
        header: "User",
        accessorKey: "user_name",
        cell: (info: any) => <div className="font-medium">{info.getValue() || "System"}</div>,
      },
      {
        header: "Action",
        accessorKey: "action",
        cell: (info: any) => (
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${getActionColor(info.getValue())}`}
          >
            {info.getValue()}
          </span>
        ),
      },
      {
        header: "Resource",
        accessorKey: "model_name_display",
        cell: (info: any) => (
          <div className="text-muted-foreground text-sm">{info.getValue() || "N/A"}</div>
        ),
      },
      {
        header: "Object",
        accessorKey: "object_repr",
        cell: (info: any) => (
          <div className="text-muted-foreground max-w-[200px] truncate text-sm">
            {info.getValue() || "N/A"}
          </div>
        ),
      },
      {
        header: "IP Address",
        accessorKey: "ip_address",
        cell: (info: any) => (
          <div className="text-muted-foreground font-mono text-xs">{info.getValue() || "N/A"}</div>
        ),
      },
      {
        header: "Details",
        id: "details",
        cell: (info: any) => (
          <RowActions
            reveal="always"
            actions={[
              {
                label: "View log details",
                icon: Eye,
                onClick: () => onView(info.row.original),
              },
            ]}
          />
        ),
      },
    ],
    [onView]
  );
