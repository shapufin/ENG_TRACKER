import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
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
import { BreakdownSection } from "../components/BreakdownSection";
import { TicketKPIHeader } from "../components/TicketKPIHeader";
import { TicketKPIStats } from "../components/TicketKPIStats";
import { TicketKPIRecentUploads } from "../components/TicketKPIRecentUploads";
import { TicketKPIFieldBreakdowns } from "../components/TicketKPIFieldBreakdowns";
import { TicketKPIEvidenceSection } from "../components/evidence/TicketKPIEvidenceSection";
import { MemberTicketRecordsTable } from "../components/MemberTicketRecordsTable";
import { useTicketKPIDashboard } from "./hooks/useTicketKPIDashboard";
import { dropRepeatedBreakdowns } from "../utils/rankBreakdown";
import { currentBusinessYear } from "@/lib/date-format-utils";

const SHOWN_ABOVE = new Set(["status", "priority", "category"]);
const EXTRA_STANDARD = ["assignee", "requester"];

const pick = <T,>(source: Record<string, T>, keys: string[]): Record<string, T> =>
  Object.fromEntries(keys.map((key) => [key, source[key]]));

const generateYearOptions = (): number[] => {
  const currentYear = currentBusinessYear();
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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-muted/40 h-28 animate-pulse rounded-lg border" />
        ))}
      </div>
      <div className="bg-muted/40 h-80 animate-pulse rounded-lg border" />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-muted/40 h-64 animate-pulse rounded-lg border" />
        <div className="bg-muted/40 h-64 animate-pulse rounded-lg border" />
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
    categoryData,
    breakdownGroup,
    breakdownClient,
    setBreakdownGroup,
    setBreakdownClient,
    batches,
    fieldBreakdowns,
  } = useTicketKPIDashboard();

  // Status, priority and category already have their own section above. A column
  // that repeats one of those, or an earlier chart, is not charted again. The
  // order is explicit (standard fields first, then A-Z) because a JSON column
  // does not keep key order on every database.
  const extraBreakdowns = React.useMemo(() => {
    const all = fieldBreakdowns ?? {};
    const keys = Object.keys(all);
    const shown = keys.filter((key) => SHOWN_ABOVE.has(key));
    const standard = keys.filter((key) => EXTRA_STANDARD.includes(key));
    const rest = keys
      .filter((key) => !SHOWN_ABOVE.has(key.toLowerCase()) && !EXTRA_STANDARD.includes(key))
      .sort((a, b) => a.localeCompare(b));
    return dropRepeatedBreakdowns(pick(all, [...shown, ...standard, ...rest]), shown);
  }, [fieldBreakdowns]);
  const { isTeamLeader } = usePermissions();
  const isLeaderOrAdmin = Boolean(isTeamLeader || user?.is_staff || user?.is_superuser);

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
          onUpload={() =>
            navigate(isFilteredView ? `/ticket-kpi/upload?for=${viewUserId}` : "/ticket-kpi/upload")
          }
          canImportForMember={isLeaderOrAdmin}
          onBack={() => navigate("/ticket-kpi/team")}
          memberName={viewUserDisplayName}
        />

        {!hasData ? (
          <SharedEmptyState
            icon={Ticket}
            title={isFilteredView ? "No KPI data for this member" : "No ticket data imported yet"}
            description={
              isFilteredView
                ? "This member has no ticket KPI data for the selected month. Try a different month or check back after they import."
                : "Import your ticket data to see KPIs, trends, and analytics on this dashboard."
            }
            action={
              isFilteredView ? (
                <Button variant="outline" onClick={() => navigate("/ticket-kpi/team")}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Team
                </Button>
              ) : (
                <Button onClick={() => navigate("/ticket-kpi/upload")}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Tickets
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

            <BreakdownSection
              data={categoryData}
              group={breakdownGroup}
              clientId={breakdownClient}
              onGroupChange={setBreakdownGroup}
              onClientChange={setBreakdownClient}
            />

            {!isFilteredView && <TicketKPIRecentUploads batches={batches} />}

            <TicketKPIFieldBreakdowns breakdowns={extraBreakdowns} />

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
                  <SelectTrigger className="w-[120px]">
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
