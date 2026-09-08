import React from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KPICard } from "../components/KPICard";
import { KPITrendChart } from "../components/KPITrendChart";
import { TicketKPITeamMemberTable } from "../components/TicketKPITeamMemberTable";
import { TicketKPITeamYearlyTab } from "../components/TicketKPITeamYearlyTab";
import { AutoMatchReview } from "../components/links/AutoMatchReview";
import { formatMonthLabel } from "@/lib/monthOptions";
import { downloadTeamCSV } from "../utils/teamCSVExport";
import { useTicketKPITeamPage } from "./hooks/useTicketKPITeamPage";
import { usePermissions } from "@/context/PermissionContext";
import { Users, Clock, Ticket, CheckCircle, Calendar, Download, ShieldAlert } from "lucide-react";

export const TicketKPITeamPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, isHR } = usePermissions();
  const {
    isTeamLeader,
    activeTab,
    setActiveTab,
    selectedMonth,
    setSelectedMonth,
    selectedYear,
    setSelectedYear,
    monthOptions,
    yearOptions,
    teamSummary,
    summaryLoading,
    yearlySummary,
    yearlyLoading,
    stats,
    yearlyStats,
    trendChartData,
    yearlyTrendChartData,
    members,
  } = useTicketKPITeamPage();

  if (!isTeamLeader) {
    return (
      <PageShell title="Team KPI">
        <EmptyState
          icon={ShieldAlert}
          title="You do not have team leader permissions."
          description="This module is reserved for assigned Team Leaders. Aggregate metrics are available in HR Reports."
          action={
            isAdmin || isHR ? (
              <Button variant="outline" size="sm" asChild>
                <a href="/hr/reports">Go to HR Reports</a>
              </Button>
            ) : undefined
          }
        />
      </PageShell>
    );
  }

  if (summaryLoading && !teamSummary && activeTab === "monthly") {
    return (
      <PageShell title="Team KPI">
        <div className="flex h-96 items-center justify-center text-muted-foreground">
          Loading...
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Team KPI Review"
      subtitle="Review ticket performance and export reports for your team."
      actions={
        activeTab === "monthly" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTeamCSV(selectedMonth, teamSummary)}
            disabled={!teamSummary || members.length === 0}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        ) : undefined
      }
    >
      <AutoMatchReview />
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="yearly">Yearly</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {formatMonthLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Total Tickets"
              value={stats.total}
              subtitle="This month"
              icon={Ticket}
              progressPercent={stats.total > 0 ? 100 : 0}
              progressColorClass="bg-indigo-500"
            />
            <KPICard
              title="Members with Data"
              value={stats.members}
              subtitle="Uploaded this month"
              icon={Users}
              progressPercent={stats.members > 0 ? 100 : 0}
              progressColorClass="bg-purple-500"
            />
            <KPICard
              title="Avg Resolution"
              value={stats.avgRes != null ? `${stats.avgRes}h` : "N/A"}
              subtitle="Per ticket"
              icon={Clock}
              progressPercent={stats.avgRes != null && stats.avgRes > 0 ? 100 : 0}
              progressColorClass="bg-blue-500"
            />
            <KPICard
              title="SLA Compliance"
              value={stats.sla != null ? `${stats.sla}%` : "N/A"}
              subtitle="Team average"
              icon={CheckCircle}
              progressPercent={stats.sla ?? undefined}
              progressColorClass="bg-emerald-500"
            />
          </div>

          <KPITrendChart
            title="6-Month Team Trend"
            data={trendChartData}
            gradientId="teamTicketsGrad"
          />

          <GlassCard isHoverLift={false}>
            <CardHeader>
              <CardTitle>Member Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <TicketKPITeamMemberTable
                members={members}
                selectedMonth={selectedMonth}
                onMemberClick={(m) =>
                  navigate(`/ticket-kpi/dashboard?user_id=${m.user_id}&month=${selectedMonth}`)
                }
              />
            </CardContent>
          </GlassCard>
        </TabsContent>

        <TabsContent value="yearly" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <Select
                value={String(selectedYear)}
                onValueChange={(v) => setSelectedYear(Number(v))}
              >
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <TicketKPITeamYearlyTab
            yearlySummary={yearlySummary}
            yearlyStats={yearlyStats}
            yearlyTrendChartData={yearlyTrendChartData}
            loading={yearlyLoading}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
};
