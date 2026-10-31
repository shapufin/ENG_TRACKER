import React from "react";
import { DashboardSectionShell } from "@/components/dashboard/DashboardSectionShell";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export interface HRRecentRow {
  id: number;
  user: string;
  userInitials: string;
  duration: string;
  date: string;
  status: string;
}

interface HRRecentTableProps {
  title: string;
  data: HRRecentRow[];
}

export const HRRecentTable: React.FC<HRRecentTableProps> = ({ title, data }) => (
  <DashboardSectionShell title={title} bodyClassName="block p-4 pt-0">
    <DataTable
      data={data}
      columns={[
        {
          accessorKey: "user",
          header: "Employee",
          cell: (info) => (
            <div className="flex items-center gap-3">
              <Avatar className="border-border h-8 w-8 border">
                <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                  {info.row.original.userInitials}
                </AvatarFallback>
              </Avatar>
              <span className="text-foreground font-medium">{info.getValue() as string}</span>
            </div>
          ),
        },
        {
          accessorKey: "duration",
          header: "Amount",
          cell: (info) => (
            <span className="text-muted-foreground font-mono">{info.getValue() as string}</span>
          ),
        },
        {
          accessorKey: "status",
          header: "Status",
          cell: (info) => <StatusBadge variant={info.getValue() as StatusVariant} />,
        },
        {
          accessorKey: "date",
          header: "Date",
          cell: (info) => (
            <span className="text-muted-foreground whitespace-nowrap">
              {info.getValue() as string}
            </span>
          ),
        },
      ]}
    />
  </DashboardSectionShell>
);
