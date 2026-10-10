import React from "react";
import { useAuth } from "@/context/AuthContext";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, CalendarDays, FileBarChart } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ReportUserTable } from "./components/ReportUserTable";
import { ReportFilterPanel } from "./components/ReportFilterPanel";
import { ReportKpiStrip } from "./components/ReportKpiStrip";
import { ReportCatalog } from "./components/ReportCatalog";
import { ReportArchivePanel } from "./components/ReportArchivePanel";
import { presetRange } from "./components/ReportPeriodPresets";
import { OvertimeStandbyReport } from "./components/OvertimeStandbyReport";
import { VacationReport } from "./components/VacationReport";
import { Navigate } from "react-router-dom";
import { useReportsPage } from "./hooks/useReportsPage";

const RESULTS_ID = "report-results";

const SkeletonPreview: React.FC = () => (
  <div aria-hidden="true" className="w-full max-w-xl space-y-2">
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-muted/60 h-10 rounded-md" />
      ))}
    </div>
    {[0, 1, 2].map((i) => (
      <div key={i} className="bg-muted/40 h-5 rounded-md" />
    ))}
  </div>
);

// fallow-ignore-next-line complexity
export const ReportsPage: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const {
    activeTab,
    setActiveTab,
    start,
    setStart,
    end,
    setEnd,
    selectedTeam,
    setSelectedTeam,
    groupBy,
    setGroupBy,
    hasGenerated,
    teams,
    summaryData,
    detailedData,
    isLoading,
    handleGenerate,
    downloadExcel,
    filteredUsersData,
  } = useReportsPage();

  if (authLoading)
    return (
      <PageShell title="Reports" subtitle="Loading...">
        <LoadingCard />
      </PageShell>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (hasGenerated && !summaryData && !detailedData && !isLoading)
    return <ErrorCard title="Analysis Failed" onRetry={() => handleGenerate()} />;

  const scopeLabel =
    selectedTeam === "all"
      ? "All teams"
      : (teams?.find((t) => String(t.id) === selectedTeam)?.name ?? "All teams");

  const generateButton = (
    <Button variant="gradient" onClick={() => handleGenerate()} disabled={isLoading}>
      <FileBarChart className="mr-2 h-4 w-4" />
      Generate Intelligence
    </Button>
  );

  const useThisMonth = () => {
    const range = presetRange("this_month", new Date());
    setStart(range.start);
    setEnd(range.end);
    handleGenerate();
  };

  const scrollToResults = () =>
    document.getElementById(RESULTS_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <PageShell
      title="Intelligence & Reports"
      subtitle="Comprehensive insights into organizational performance and leave management."
      actions={hasGenerated ? generateButton : undefined}
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <ReportFilterPanel
            start={start}
            end={end}
            selectedTeam={selectedTeam}
            groupBy={groupBy}
            teams={teams}
            onStartChange={setStart}
            onEndChange={setEnd}
            onTeamChange={setSelectedTeam}
            onGroupByChange={setGroupBy}
          />
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "overtime_standby" | "vacation")}
            className="w-full"
          >
            <TabsList className="bg-muted/50 grid h-11 w-full max-w-[400px] grid-cols-2 border p-1">
              <TabsTrigger
                value="overtime_standby"
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Clock className="mr-2 h-4 w-4" /> OT & Standby
              </TabsTrigger>
              <TabsTrigger
                value="vacation"
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <CalendarDays className="mr-2 h-4 w-4" /> Vacations
              </TabsTrigger>
            </TabsList>
            <div className="mt-6 space-y-6">
              {!hasGenerated ? (
                <GlassCard className="p-6">
                  <EmptyState
                    size="md"
                    tone="info"
                    icon={FileBarChart}
                    title="Pick a period, then generate"
                    description="Totals, per-person breakdown and Excel exports appear here."
                    action={generateButton}
                    secondaryAction={
                      <Button variant="ghost" onClick={useThisMonth} disabled={isLoading}>
                        Use this month
                      </Button>
                    }
                    preview={<SkeletonPreview />}
                  />
                </GlassCard>
              ) : isLoading ? (
                <LoadingCard rows={4} />
              ) : summaryData ? (
                <>
                  <ReportKpiStrip tab={activeTab} summary={summaryData} scopeLabel={scopeLabel} />
                  <ReportCatalog
                    tab={activeTab}
                    summary={summaryData}
                    start={start}
                    end={end}
                    scopeLabel={scopeLabel}
                    canExport
                    onExport={(kind) => downloadExcel(kind)}
                    onView={scrollToResults}
                  />
                  <SectionHeading
                    id={RESULTS_ID}
                    eyebrow="Results"
                    title={
                      activeTab === "overtime_standby"
                        ? "Efficiency & Capacity Metrics"
                        : "Organization Presence Analysis"
                    }
                  />
                  <TabsContent value="overtime_standby" className="m-0 space-y-6">
                    <OvertimeStandbyReport
                      summaryData={summaryData}
                      detailedData={detailedData}
                      groupBy={groupBy}
                    />
                  </TabsContent>
                  <TabsContent value="vacation" className="m-0 space-y-6">
                    <VacationReport
                      summaryData={summaryData}
                      detailedData={detailedData}
                      groupBy={groupBy}
                    />
                  </TabsContent>
                  {groupBy === "user" && (
                    <GlassCard className="border-border/70 overflow-hidden p-0 shadow-xl">
                      <CardHeader className="bg-muted/30 border-b p-6">
                        <CardTitle className="text-lg">Detailed Personnel Breakdown</CardTitle>
                        <CardDescription>
                          Individual activity metrics based on current filters
                        </CardDescription>
                      </CardHeader>
                      <div className="p-6">
                        <ReportUserTable activeTab={activeTab} data={filteredUsersData} />
                      </div>
                    </GlassCard>
                  )}
                </>
              ) : null}
            </div>
          </Tabs>
        </div>
        <aside className="min-w-0 empty:hidden">
          <ReportArchivePanel />
        </aside>
      </div>
    </PageShell>
  );
};
