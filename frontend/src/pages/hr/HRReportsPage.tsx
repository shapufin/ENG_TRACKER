/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import { useHRReportManagement } from "@/hooks/useHRReportManagement";
import { reportService } from "@/services/reportService";
import { PageShell } from "@/components/layout/PageShell";
import { currentBusinessMonthKey, getMonthEndISO, toLocalISODate } from "@/lib/date-format-utils";

import { handleApiError } from "@/lib/error-handler";
import { HRReportFilters } from "./components/HRReportFilters";
import { HRReportActionBar } from "./components/HRReportActionBar";
import { HRReportResults } from "./components/HRReportResults";
import { buildTrendData } from "./trendData";

export const HRReportsPage: React.FC = () => {
  // Business month (Europe/Tirane), never the browser's clock.
  const [start, setStart] = useState(() => `${currentBusinessMonthKey()}-01`);
  const [end, setEnd] = useState(() => getMonthEndISO(`${currentBusinessMonthKey()}-01`) ?? "");
  const [selectedItalianTL, setSelectedItalianTL] = useState<string>("all");
  const [selectedAlbanianTL, setSelectedAlbanianTL] = useState<string>("all");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportType, setExportType] = useState<"ot-standby" | "leave" | "payroll">("ot-standby");
  const [exportStatus, setExportStatus] = useState<"approved" | "pending">("approved");
  const [exportLoading, setExportLoading] = useState(false);

  const {
    italianTLs,
    albanianTLs,
    teams,
    workspaces,
    summaryLoading,
    detailedData,
    detailedLoading,
    trendReport,
    leaveList,
    insightsData,
    topTeamLeadersData,
    handleGenerate,
  } = useHRReportManagement({
    start,
    end,
    selectedItalianTL,
    selectedAlbanianTL,
    selectedTeam,
    selectedWorkspace,
  });

  // First visit shows the current month straight away; later filter edits wait for Generate.
  useEffect(() => {
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fallow-ignore-next-line complexity
  const downloadDetailedExport = async (
    type: "ot-standby" | "leave" | "payroll",
    status: "approved" | "pending"
  ) => {
    try {
      setExportLoading(true);
      const params = {
        start_date: start,
        end_date: end,
        italian_tl_ids:
          selectedItalianTL === "all" || selectedItalianTL === "none"
            ? undefined
            : selectedItalianTL,
        albanian_tl_ids:
          selectedAlbanianTL === "all" || selectedAlbanianTL === "none"
            ? undefined
            : selectedAlbanianTL,
        workspace_ids: selectedWorkspace === "all" ? undefined : selectedWorkspace,
        team_ids: selectedTeam === "all" ? undefined : selectedTeam,
      };
      const blob =
        type === "ot-standby"
          ? await reportService.exportOTStandby({ ...params, status })
          : type === "payroll"
            ? await reportService.exportPayrollOTStandby({ ...params, status })
            : await reportService.exportLeave(params);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = toLocalISODate(new Date());
      const typeLabel =
        type === "ot-standby"
          ? status === "pending"
            ? "ot_standby_pending"
            : "ot_standby"
          : type === "payroll"
            ? "ot_standby_payroll"
            : "leave";
      a.download = `${typeLabel}_export_${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setExportDialogOpen(false);
    } catch (error) {
      handleApiError(error);
    } finally {
      setExportLoading(false);
    }
  };

  const trendData = buildTrendData(trendReport);

  const isLoading = summaryLoading || detailedLoading;

  return (
    <PageShell
      title="HR Intelligence & Reports"
      subtitle="Strategic organizational insights and detailed personnel activity metrics."
    >
      <div className="space-y-6">
        <HRReportFilters
          start={start}
          onStartChange={setStart}
          end={end}
          onEndChange={setEnd}
          selectedItalianTL={selectedItalianTL}
          onItalianTLChange={setSelectedItalianTL}
          selectedAlbanianTL={selectedAlbanianTL}
          onAlbanianTLChange={setSelectedAlbanianTL}
          selectedTeam={selectedTeam}
          onTeamChange={setSelectedTeam}
          selectedWorkspace={selectedWorkspace}
          onWorkspaceChange={setSelectedWorkspace}
          italianTLs={italianTLs}
          albanianTLs={albanianTLs}
          teams={teams}
          workspaces={workspaces}
          isLoading={isLoading}
          onGenerate={handleGenerate}
          onResetFilters={() => {
            setSelectedItalianTL("all");
            setSelectedAlbanianTL("all");
            setSelectedTeam("all");
            setSelectedWorkspace("all");
          }}
        />

        <HRReportResults
          isLoading={isLoading}
          insightsData={insightsData}
          topTeamLeadersData={topTeamLeadersData}
          trendData={trendData}
          detailedData={detailedData}
          leaveList={leaveList}
          teams={teams}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          actionBar={
            <HRReportActionBar
              exportDialogOpen={exportDialogOpen}
              onExportDialogOpenChange={setExportDialogOpen}
              exportType={exportType}
              onExportTypeChange={setExportType}
              exportStatus={exportStatus}
              onExportStatusChange={setExportStatus}
              exportLoading={exportLoading}
              onExport={() => downloadDetailedExport(exportType, exportStatus)}
              start={start}
              end={end}
              selectedItalianTL={selectedItalianTL}
              selectedAlbanianTL={selectedAlbanianTL}
              selectedTeam={selectedTeam}
              selectedWorkspace={selectedWorkspace}
              teams={teams}
              italianTLs={italianTLs}
              albanianTLs={albanianTLs}
            />
          }
        />
      </div>
    </PageShell>
  );
};
