import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/ui/DataTable";
import { KPICard } from "../KPICard";
import { KPITrendChart } from "../KPITrendChart";
import {
  BarChart3,
  FileSpreadsheet,
  Download,
  Users,
  Ticket,
  Clock,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ticketKPIService } from "../../services/ticketKPIService";
import type { ColumnDef } from "@tanstack/react-table";
import type { YearlyReport } from "../../types/ticketKPI";

const reportUserColumns: ColumnDef<YearlyReport["per_user_summary"][number]>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "username", header: "Username" },
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
      row.original.sla_compliance_pct !== undefined ? `${row.original.sla_compliance_pct}%` : "N/A",
  },
];

interface ReportsSectionProps {
  year: number;
  onYearChange: (year: number) => void;
}

export const ReportsSection: React.FC<ReportsSectionProps> = ({ year, onYearChange }) => {
  const [reportFormat, setReportFormat] = React.useState<"excel" | "csv">("excel");

  const { data: reportPreview, isLoading: reportLoading } = useQuery({
    queryKey: ["ticket_kpi", "yearly_summary", year],
    queryFn: () => ticketKPIService.getYearlySummary(year).then((r) => r.data),
  });

  const monthlyTrendData = useMemo(
    () =>
      reportPreview?.monthly_breakdown.map((m) => ({
        month: m.month,
        tickets: m.total_tickets,
        avgHours: m.avg_resolution_hours ?? 0,
      })) ?? [],
    [reportPreview]
  );

  const handleDownloadReport = async () => {
    try {
      const blob = await ticketKPIService.downloadReport(year, reportFormat);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket_kpi_report_${year}.${reportFormat === "excel" ? "xlsx" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Report downloaded");
    } catch {
      toast.error("Download failed");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5 text-primary" /> Yearly KPI Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Year</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => onYearChange(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Format</Label>
              <div className="flex gap-2">
                <Button
                  variant={reportFormat === "excel" ? "default" : "outline"}
                  onClick={() => setReportFormat("excel")}
                >
                  <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
                </Button>
                <Button
                  variant={reportFormat === "csv" ? "default" : "outline"}
                  onClick={() => setReportFormat("csv")}
                >
                  <Download className="mr-1 h-4 w-4" /> CSV
                </Button>
              </div>
              {reportFormat === "csv" && (
                <p className="text-xs text-muted-foreground">
                  CSV includes per-user rows only. Excel includes summary and monthly breakdown.
                </p>
              )}
            </div>
            <div className="flex items-end">
              <Button onClick={handleDownloadReport} className="w-full">
                <Download className="mr-2 h-4 w-4" /> Download Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {reportLoading && (
        <div className="space-y-4" aria-busy="true">
          <span className="sr-only">Loading report...</span>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted/40" />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-lg border bg-muted/40" />
          <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />
        </div>
      )}

      {reportPreview && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Users with Data"
              value={reportPreview.users_with_data}
              subtitle="This year"
              icon={Users}
            />
            <KPICard
              title="Total Tickets"
              value={reportPreview.total_tickets}
              subtitle="This year"
              icon={Ticket}
            />
            <KPICard
              title="Avg Resolution"
              value={`${reportPreview.avg_resolution_hours ?? 0}h`}
              subtitle="Per ticket"
              icon={Clock}
            />
            <KPICard
              title="SLA Compliance"
              value={`${reportPreview.sla_compliance_pct ?? 0}%`}
              subtitle="Team average"
              icon={CheckCircle}
            />
          </div>

          <KPITrendChart
            title="Monthly Breakdown"
            data={monthlyTrendData}
            gradientId="reportTrendGrad"
          />

          <Card>
            <CardHeader>
              <CardTitle>Per-User Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={reportUserColumns}
                data={reportPreview.per_user_summary}
                searchColumn="name"
                searchPlaceholder="Search user..."
                pageSize={10}
                emptyMessage="No user data for this year."
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
