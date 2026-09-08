import React from "react";
import { useAuth } from "@/context/AuthContext";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, CalendarDays, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ReportUserTable } from "./components/ReportUserTable";
import { ReportFilterPanel } from "./components/ReportFilterPanel";
import { ReportExportActions } from "./components/ReportExportActions";
import { OvertimeStandbyReport } from "./components/OvertimeStandbyReport";
import { VacationReport } from "./components/VacationReport";
import { Navigate } from "react-router-dom";
import { useReportsPage } from "./hooks/useReportsPage";

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

  return (
    <PageShell
      title="Intelligence & Reports"
      subtitle="Comprehensive insights into organizational performance and leave management."
    >
      <div className="space-y-6">
        <ReportFilterPanel
          start={start}
          end={end}
          selectedTeam={selectedTeam}
          groupBy={groupBy}
          teams={teams}
          isLoading={isLoading}
          onStartChange={setStart}
          onEndChange={setEnd}
          onTeamChange={setSelectedTeam}
          onGroupByChange={setGroupBy}
          onGenerate={() => handleGenerate()}
        />
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "overtime_standby" | "vacation")}
          className="w-full"
        >
          <TabsList className="grid h-11 w-full max-w-[400px] grid-cols-2 border bg-muted/50 p-1">
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
              <GlassCard className="flex flex-col items-center justify-center p-20 text-center">
                <TrendingUp className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Ready for Analysis</h3>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Configure your parameters above and click "Generate Intelligence" to populate the
                  reports.
                </p>
              </GlassCard>
            ) : isLoading ? (
              <LoadingCard rows={4} />
            ) : summaryData ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight sm:text-xl">
                    {activeTab === "overtime_standby"
                      ? "Efficiency & Capacity Metrics"
                      : "Organization Presence Analysis"}
                  </h2>
                  <ReportExportActions
                    activeTab={activeTab}
                    onExportOvertime={() => downloadExcel("overtime")}
                    onExportStandby={() => downloadExcel("standby")}
                    onExportLeave={() => downloadExcel("leave")}
                  />
                </div>
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
                  <GlassCard className="overflow-hidden border-border/70 p-0 shadow-xl">
                    <CardHeader className="border-b bg-muted/30 p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">Detailed Personnel Breakdown</CardTitle>
                          <CardDescription>
                            Individual activity metrics based on current filters
                          </CardDescription>
                        </div>
                      </div>
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
    </PageShell>
  );
};
