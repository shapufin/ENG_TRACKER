import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { EmptyState as SharedEmptyState } from "@/components/ui/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Ticket, Upload, ArrowLeft } from "lucide-react";
import { KPITrendChart } from "../components/KPITrendChart";
import { CategoryPieChart } from "../components/CategoryPieChart";
import { TicketKPIHeader } from "../components/TicketKPIHeader";
import { TicketKPIStats } from "../components/TicketKPIStats";
import { TicketKPIRecentUploads } from "../components/TicketKPIRecentUploads";
import { TicketKPIFieldBreakdowns } from "../components/TicketKPIFieldBreakdowns";
import { TicketKPIEvidenceSection } from "../components/evidence/TicketKPIEvidenceSection";
import { MemberTicketRecordsTable } from "../components/MemberTicketRecordsTable";
import { useTicketKPIDashboard } from "./hooks/useTicketKPIDashboard";

const generateYearOptions = (): number[] => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= currentYear - 5; y--) {
    years.push(y);
  }
  return years;
};

const LoadingState: React.FC = () => (
  <PageShell title="Ticket KPI Dashboard">
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading...</span>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-lg border bg-muted/40" />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />
        <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />
      </div>
    </div>
  </PageShell>
);

export const TicketKPIDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    selectedMonth,
    setSelectedMonth,
    viewMode,
    selectedYear,
    setViewMode,
    setSelectedYear,
    isFilteredView,
    viewUserId,
    viewUserDisplayName,
    kpiLoading,
    hasData,
    stats,
    trendChartData,
    categoryChartData,
    batches,
    fieldBreakdowns,
  } = useTicketKPIDashboard();

  const yearOptions = React.useMemo(() => generateYearOptions(), []);

  const pageTitle = isFilteredView
    ? viewUserDisplayName
      ? `${viewUserDisplayName} — Ticket KPI`
      : "Member Ticket Dashboard"
    : "Ticket KPI Dashboard";

  if (kpiLoading && !hasData) return <LoadingState />;

  return (
    <PageShell title={pageTitle}>
      <div className="space-y-6">
        <TicketKPIHeader
          isFilteredView={isFilteredView}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          onUpload={() => navigate("/ticket-kpi/upload")}
          onBack={() => navigate("/ticket-kpi/team")}
          memberName={viewUserDisplayName}
        />

        {!hasData ? (
          <SharedEmptyState
            icon={Ticket}
            title={isFilteredView ? "No KPI data for this member" : "No ticket data uploaded yet"}
            description={
              isFilteredView
                ? "This member has no ticket KPI data for the selected month. Try a different month or check back after they upload."
                : "Upload your ticket data to see KPIs, trends, and analytics on this dashboard."
            }
            action={
              isFilteredView ? (
                <Button variant="outline" onClick={() => navigate("/ticket-kpi/team")}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Team
                </Button>
              ) : (
                <Button onClick={() => navigate("/ticket-kpi/upload")}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Ticket Data
                </Button>
              )
            }
          />
        ) : (
          <>
            <TicketKPIStats
              total={stats.total}
              closed={stats.closed}
              avgRes={stats.avgRes}
              sla={stats.sla}
              p50={stats.p50}
              p90={stats.p90}
              comparison={stats.comparison}
            />

            <KPITrendChart title="12-Month Trend" data={trendChartData} gradientId="ticketsGrad" />

            <div className="grid gap-6 md:grid-cols-2">
              <CategoryPieChart title="Category Breakdown" data={categoryChartData} />
              {!isFilteredView && <TicketKPIRecentUploads batches={batches} />}
            </div>

            <TicketKPIFieldBreakdowns breakdowns={fieldBreakdowns} />

            {/* Month/Year toggle for ticket records */}
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("month")}
              >
                Monthly
              </Button>
              <Button
                variant={viewMode === "year" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("year")}
              >
                Yearly
              </Button>
              {viewMode === "year" && (
                <Select
                  value={String(selectedYear)}
                  onValueChange={(v) => setSelectedYear(Number(v))}
                >
                  <SelectTrigger className="h-9 w-[120px]">
                    <SelectValue>{String(selectedYear)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <MemberTicketRecordsTable
              month={viewMode === "month" ? selectedMonth : undefined}
              year={viewMode === "year" ? selectedYear : undefined}
              userId={isFilteredView ? viewUserId : user?.id}
            />
          </>
        )}

        <TicketKPIEvidenceSection
          month={selectedMonth}
          userId={isFilteredView ? viewUserId : undefined}
        />
      </div>
    </PageShell>
  );
};
