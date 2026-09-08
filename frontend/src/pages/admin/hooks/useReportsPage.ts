import { useState, useMemo } from "react";
import { useReportManagement } from "@/hooks/useReportManagement";
import { reportService } from "@/services/reportService";
import { handleApiError } from "@/lib/error-handler";
import { useValidWorkspaceIds } from "@/hooks/useValidWorkspaceIds";

export const useReportsPage = () => {
  const [activeTab, setActiveTab] = useState<"overtime_standby" | "vacation">("overtime_standby");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [groupBy, setGroupBy] = useState<"user" | "month" | "year">("user");
  const [hasGenerated, setHasGenerated] = useState(false);

  // Use synchronously-validated IDs so stale localStorage values never
  // reach report API calls. This page is not protected by useWorkspaceInit
  // (which only runs inside WorkspaceSelector on the calendar page).
  const { validIds: selectedWorkspaceIds } = useValidWorkspaceIds();
  const workspaceParam =
    selectedWorkspaceIds.length > 0 ? selectedWorkspaceIds.join(",") : undefined;

  const { teams, summaryData, summaryLoading, detailedData, detailedLoading, onGenerate } =
    useReportManagement({
      start_date: start,
      end_date: end,
      activeTab,
      workspace_ids: workspaceParam,
      groupBy,
    });

  const handleGenerate = (e?: React.FormEvent) => {
    e?.preventDefault();
    setHasGenerated(true);
    onGenerate();
  };

  const currentType = activeTab === "overtime_standby" ? "combined" : "leave";

  // fallow-ignore-next-line complexity
  const downloadExcel = async (typeOverride?: "overtime" | "standby" | "leave") => {
    try {
      const blob = await reportService.exportExcel({
        start_date: start,
        end_date: end,
        report_type: typeOverride || currentType,
        workspace_ids: workspaceParam,
        team_ids: selectedTeam === "all" ? undefined : selectedTeam,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report_${typeOverride || activeTab}_${start || "all"}_${end || "all"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      handleApiError(err);
    }
  };

  const isLoading = summaryLoading || detailedLoading;

  const filteredUsersData = useMemo(() => {
    if (!detailedData?.users) return [];
    return detailedData.users.filter(
      (u) =>
        selectedTeam === "all" || u.team === teams?.find((t) => String(t.id) === selectedTeam)?.name
    );
  }, [detailedData, selectedTeam, teams]);

  return {
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
    setHasGenerated,
    teams,
    summaryData,
    detailedData,
    isLoading,
    handleGenerate,
    downloadExcel,
    filteredUsersData,
  };
};
