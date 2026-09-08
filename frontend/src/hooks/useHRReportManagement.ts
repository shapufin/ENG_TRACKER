import { useHRReportFilterOptions } from "./useHRReportFilterOptions";
import { useHRReportQueries } from "./useHRReportQueries";

export type TeamLeaderOption = {
  id: number;
  full_name: string;
  member_count: number;
  team_name?: string | null;
};

interface UseHRReportManagementOptions {
  start: string;
  end: string;
  selectedItalianTL: string;
  selectedAlbanianTL: string;
  selectedTeam: string;
  selectedWorkspace: string;
}

export const useHRReportManagement = ({
  start,
  end,
  selectedItalianTL,
  selectedAlbanianTL,
  selectedTeam,
  selectedWorkspace,
}: UseHRReportManagementOptions) => {
  const { italianTLs, albanianTLs, teams, workspaces } = useHRReportFilterOptions();
  const {
    summaryData,
    summaryLoading,
    detailedData,
    detailedLoading,
    leaveList,
    insightsData,
    topTeamLeadersData,
    refetchAll,
  } = useHRReportQueries({
    start,
    end,
    selectedItalianTL,
    selectedAlbanianTL,
    selectedTeam,
    selectedWorkspace,
  });

  return {
    italianTLs,
    albanianTLs,
    teams,
    workspaces,
    summaryData,
    summaryLoading,
    detailedData,
    detailedLoading,
    leaveList,
    insightsData,
    topTeamLeadersData,
    handleGenerate: refetchAll,
  };
};
