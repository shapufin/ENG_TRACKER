/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { AuditLog } from "@/services/auditService";

// fallow-ignore-next-line complexity
const getActionColor = (action: string) => {
  if (action.includes("create") || action.includes("add")) return "bg-primary/10 text-foreground";
  if (action.includes("update") || action.includes("edit")) return "bg-warning/10 text-warning";
  if (action.includes("delete") || action.includes("remove"))
    return "bg-destructive/10 text-destructive";
  return "bg-primary/10 text-foreground";
};

export const useAuditLogColumns = (onView: (log: AuditLog) => void) =>
  useMemo(
    () => [
      {
        header: "Timestamp",
        accessorKey: "timestamp",
        cell: (info: any) => (
          <div className="text-sm text-muted-foreground">
            {new Date(info.getValue()).toLocaleString()}
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
          <div className="text-sm text-muted-foreground">{info.getValue() || "N/A"}</div>
        ),
      },
      {
        header: "Object",
        accessorKey: "object_repr",
        cell: (info: any) => (
          <div className="max-w-[200px] truncate text-sm text-muted-foreground">
            {info.getValue() || "N/A"}
          </div>
        ),
      },
      {
        header: "IP Address",
        accessorKey: "ip_address",
        cell: (info: any) => (
          <div className="font-mono text-xs text-muted-foreground">{info.getValue() || "N/A"}</div>
        ),
      },
      {
        header: "Details",
        id: "details",
        cell: (info: any) => (
          <Button variant="ghost" size="sm" onClick={() => onView(info.row.original)}>
            View
          </Button>
        ),
      },
    ],
    [onView]
  );
