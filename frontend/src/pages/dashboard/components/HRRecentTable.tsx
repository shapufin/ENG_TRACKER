import React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardSectionShell } from "@/components/dashboard/DashboardSectionShell";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface HRRecentTableProps {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
}

export const HRRecentTable: React.FC<HRRecentTableProps> = ({ title, data }) => (
  <DashboardSectionShell
    title={title}
    controls={
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground h-8 w-8"
        aria-label={`More options for ${title}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    }
    bodyClassName="block p-4 pt-0"
  >
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
      ]}
    />
  </DashboardSectionShell>
);
