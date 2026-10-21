import { useState, useMemo, useEffect, useRef } from "react";
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
      selectedTeam,
    });

  const handleGenerate = (e?: React.FormEvent) => {
    e?.preventDefault();
    setHasGenerated(true);
    onGenerate();
  };

  // The range is state, so generating in the same tick would use the previous
  // dates. Flag the request and generate once the new range has rendered.
  const pendingGenerate = useRef(false);
  const generateForRange = (range: { start: string; end: string }) => {
    if (range.start === start && range.end === end) return handleGenerate();
    pendingGenerate.current = true;
    setStart(range.start);
    setEnd(range.end);
  };
  useEffect(() => {
    if (!pendingGenerate.current) return;
    pendingGenerate.current = false;
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

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
    generateForRange,
    downloadExcel,
    filteredUsersData,
  };
};
