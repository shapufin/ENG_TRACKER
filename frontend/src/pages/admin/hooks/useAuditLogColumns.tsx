/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { Eye } from "lucide-react";
import { RowActions } from "@/components/ui/RowActions";
import { toneSurfaceClass, type Tone } from "@/components/ui/tone";
import type { AuditLog } from "@/services/auditService";

// Server actions arrive upper-case (CREATE/UPDATE/DELETE), so match case-insensitively.
const getActionTone = (action: string): Tone => {
  const a = action.toLowerCase();
  if (
    a.includes("fail") ||
    a.includes("lock") ||
    a.includes("delete") ||
    a.includes("remove") ||
    a.includes("reject")
  )
    return "danger";
  if (a.includes("create") || a.includes("add") || a.includes("success") || a.includes("approve"))
    return "success";
  if (a.includes("update") || a.includes("edit") || a.includes("change")) return "warning";
  return "neutral";
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
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${toneSurfaceClass[getActionTone(info.getValue())]}`}
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
        cell: (info: any) => {
          // object_repr can start with a separator when the name part is empty.
          const label = String(info.getValue() ?? "").replace(/^[\s-]+/, "") || "N/A";
          return (
            <div className="text-muted-foreground max-w-[200px] truncate text-sm" title={label}>
              {label}
            </div>
          );
        },
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
