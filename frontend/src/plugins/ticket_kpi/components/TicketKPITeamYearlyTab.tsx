import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";
import { KPICard } from "./KPICard";
import { KPITrendChart } from "./KPITrendChart";
import { FieldsPopulatedBadges } from "./FieldsPopulatedBadges";
import { Ticket, Users, Clock, CheckCircle } from "lucide-react";
import type { YearlyMemberRow, YearlySummary } from "../pages/hooks/useTicketKPITeamPage";

interface TicketKPITeamYearlyTabProps {
  yearlySummary: YearlySummary | undefined;
  yearlyStats: {
    total: number;
    members: number;
    avgRes: number | null;
    sla: number | null;
  };
  yearlyTrendChartData: Array<{ month: string; tickets: number; avgHours: number }>;
  loading: boolean;
}

export const TicketKPITeamYearlyTab: React.FC<TicketKPITeamYearlyTabProps> = ({
  yearlySummary,
  yearlyStats,
  yearlyTrendChartData,
  loading,
}) => {
  const columns = useMemo<ColumnDef<YearlyMemberRow>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "total_tickets", header: "Total Tickets" },
      {
        accessorKey: "months_with_data",
        header: "Months",
        cell: ({ row }) => row.original.months_with_data ?? 0,
      },
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
        cell: ({ row }) => <FieldsPopulatedBadges fields={row.original.fields_populated} max={5} />,
      },
    ],
    []
  );

  const members = yearlySummary?.per_user_summary ?? [];

  if (loading && !yearlySummary) {
    return (
      <div className="space-y-6" aria-busy="true">
        <span className="sr-only">Loading yearly summary...</span>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-lg border bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Tickets"
          value={yearlyStats.total}
          subtitle="Full year"
          icon={Ticket}
        />
        <KPICard
          title="Members with Data"
          value={yearlyStats.members}
          subtitle="Uploaded this year"
          icon={Users}
        />
        <KPICard
          title="Avg Resolution"
          value={yearlyStats.avgRes != null ? `${yearlyStats.avgRes}h` : "N/A"}
          subtitle="Per ticket"
          icon={Clock}
        />
        <KPICard
          title="SLA Compliance"
          value={yearlyStats.sla != null ? `${yearlyStats.sla}%` : "N/A"}
          subtitle="Team average"
          icon={CheckCircle}
        />
      </div>

      <KPITrendChart
        title="Monthly Trend"
        data={yearlyTrendChartData}
        gradientId="yearlyTeamGrad"
      />

      <Card>
        <CardHeader>
          <CardTitle>Per-Member Yearly Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No member data for this year.</p>
          ) : (
            <DataTable
              columns={columns}
              data={members}
              searchColumn="name"
              searchPlaceholder="Search member..."
              pageSize={10}
              emptyMessage="No member data for this year."
            />
          )}
        </CardContent>
      </Card>

      {yearlySummary && yearlySummary.monthly_breakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {yearlySummary.monthly_breakdown.map((m) => (
                <Badge key={m.month} variant="outline" className="gap-1.5 py-1.5">
                  <span className="font-medium">{m.month}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="tabular-nums">{m.total_tickets} tickets</span>
                  {m.avg_resolution_hours != null && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="tabular-nums">{m.avg_resolution_hours}h</span>
                    </>
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
