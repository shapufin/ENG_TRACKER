import React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface HRRecentTableProps {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
}

export const HRRecentTable: React.FC<HRRecentTableProps> = ({ title, data }) => (
  <GlassCard className="overflow-hidden border-border/70 bg-card">
    <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </div>
    <div className="p-4">
      <DataTable
        data={data}
        columns={[
          {
            accessorKey: "user",
            header: "Employee",
            cell: (info) => (
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8 border border-border">
                  <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
                    {info.row.original.userInitials}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-foreground">{info.getValue() as string}</span>
              </div>
            ),
          },
          {
            accessorKey: "duration",
            header: "Amount",
            cell: (info) => (
              <span className="font-mono text-muted-foreground">{info.getValue() as string}</span>
            ),
          },
          {
            accessorKey: "status",
            header: "Status",
            cell: (info) => <StatusBadge variant={info.getValue() as StatusVariant} />,
          },
        ]}
      />
    </div>
  </GlassCard>
);
