import React, { useMemo } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Eye } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { TeamMemberRow } from "../utils/teamCSVExport";
import { FieldsPopulatedBadges } from "./FieldsPopulatedBadges";

interface TicketKPITeamMemberTableProps {
  members: TeamMemberRow[];
  selectedMonth: string;
  onMemberClick?: (member: TeamMemberRow) => void;
}

export const TicketKPITeamMemberTable: React.FC<TicketKPITeamMemberTableProps> = ({
  members,
  onMemberClick,
}) => {
  const membersWithData = useMemo(
    () => members.filter((m) => m.total_tickets > 0).length,
    [members]
  );

  const columns = useMemo<ColumnDef<TeamMemberRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-2 font-medium">
            {row.original.name}
            <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
          </div>
        ),
      },
      { accessorKey: "total_tickets", header: "Tickets" },
      {
        accessorKey: "avg_resolution_hours",
        header: "Avg Resolution",
        cell: ({ row }) =>
          row.original.avg_resolution_hours !== undefined
            ? `${row.original.avg_resolution_hours}h`
            : "N/A",
      },
      {
        accessorKey: "sla_compliance_pct",
        header: "SLA %",
        cell: ({ row }) =>
          row.original.sla_compliance_pct !== undefined
            ? `${row.original.sla_compliance_pct}%`
            : "N/A",
      },
      {
        id: "fields_populated",
        header: "Fields",
        cell: ({ row }) => <FieldsPopulatedBadges fields={row.original.fields_populated} />,
      },
    ],
    []
  );

  if (members.length === 0)
    return <p className="text-sm text-muted-foreground">No member data for this month.</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {members.length} member{members.length !== 1 ? "s" : ""} · {membersWithData} with data this
        month
      </p>
      <DataTable
        columns={columns}
        data={members}
        searchColumn="name"
        searchPlaceholder="Search member..."
        pageSize={10}
        getRowClassName={() => "cursor-pointer group"}
        onRowClick={(row) => onMemberClick?.(row)}
        emptyMessage="No member data for this month."
      />
    </div>
  );
};
