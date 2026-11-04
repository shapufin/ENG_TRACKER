import { useQuery } from "@tanstack/react-query";
import { reportService, type SummaryReport, type DetailedReport } from "@/services/reportService";
import { leaveService } from "@/services/leaveService";
import { REPORT_QUERY_OPTIONS } from "@/lib/queryOptions";

interface UseHRReportQueriesOptions {
  start: string;
  end: string;
  selectedItalianTL: string;
  selectedAlbanianTL: string;
  selectedTeam: string;
  selectedWorkspace: string;
}

const TREND_MONTHS = 6;

/** First day of the month `TREND_MONTHS - 1` months before `end`'s month (string math, no clock). */
export const trendWindowStart = (end: string): string => {
  const [y, m] = end.split("-").map(Number);
  if (!y || !m) return end;
  const index = y * 12 + (m - 1) - (TREND_MONTHS - 1);
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
};

export const useHRReportQueries = ({
  start,
  end,
  selectedItalianTL,
  selectedAlbanianTL,
  selectedTeam,
  selectedWorkspace,
}: UseHRReportQueriesOptions) => {
  const filterParams = {
    start_date: start,
    end_date: end,
    italian_tl_id: selectedItalianTL === "all" ? undefined : selectedItalianTL,
    albanian_tl_id: selectedAlbanianTL === "all" ? undefined : selectedAlbanianTL,
    team_ids: selectedTeam === "all" ? undefined : selectedTeam,
    workspace_ids: selectedWorkspace === "all" ? undefined : selectedWorkspace,
  };

  const {
    data: summaryData,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery<SummaryReport>({
    queryKey: [
      "reports",
      "summary",
      start,
      end,
      selectedItalianTL,
      selectedAlbanianTL,
      selectedTeam,
      selectedWorkspace,
    ],
    queryFn: () => reportService.getSummary({ ...filterParams, report_type: "combined" }),
    ...REPORT_QUERY_OPTIONS,
    enabled: false,
  });

  const {
    data: detailedData,
    isLoading: detailedLoading,
    refetch: refetchDetailed,
  } = useQuery<DetailedReport>({
    queryKey: [
      "reports",
      "detailed",
      start,
      end,
      selectedItalianTL,
      selectedAlbanianTL,
      selectedTeam,
      selectedWorkspace,
    ],
    queryFn: () =>
      reportService.getDetailed({ ...filterParams, report_type: "combined", group_by: "user" }),
    ...REPORT_QUERY_OPTIONS,
    enabled: false,
  });

  const { data: trendReport, refetch: refetchTrend } = useQuery<DetailedReport>({
    queryKey: [
      "reports",
      "trend",
      trendWindowStart(end),
      end,
      selectedItalianTL,
      selectedAlbanianTL,
      selectedTeam,
      selectedWorkspace,
    ],
    queryFn: () =>
      reportService.getDetailed({
        ...filterParams,
        start_date: trendWindowStart(end),
        report_type: "combined",
        group_by: "month",
      }),
    ...REPORT_QUERY_OPTIONS,
    enabled: false,
  });

  const { data: leaveList, refetch: refetchLeaveList } = useQuery({
    queryKey: [
      "hr",
      "leave-requests",
      start,
      end,
      selectedItalianTL,
      selectedAlbanianTL,
      selectedTeam,
      selectedWorkspace,
    ],
    queryFn: () =>
      leaveService.getRequests({
        start_date: start,
        end_date: end,
        user__profile__italian_tl: selectedItalianTL === "all" ? undefined : selectedItalianTL,
        user__profile__albanian_tl: selectedAlbanianTL === "all" ? undefined : selectedAlbanianTL,
        user__profile__teams: selectedTeam === "all" ? undefined : selectedTeam,
        page_size: 1000,
      } as Record<string, unknown>),
    refetchOnMount: true,
    staleTime: 300000,
    refetchOnWindowFocus: false,
    enabled: false,
  });

  const { data: insightsData, refetch: refetchInsights } = useQuery({
    queryKey: [
      "reports",
      "insights",
      start,
      end,
      selectedItalianTL,
      selectedAlbanianTL,
      selectedTeam,
      selectedWorkspace,
    ],
    queryFn: () => reportService.getInsights(filterParams),
    enabled: false,
  });

  const { data: topTeamLeadersData, refetch: refetchTopTeamLeaders } = useQuery({
    queryKey: [
      "reports",
      "top-team-leaders",
      start,
      end,
      selectedItalianTL,
      selectedAlbanianTL,
      selectedTeam,
      selectedWorkspace,
    ],
    queryFn: () => reportService.getTopTeamLeaders(filterParams),
    ...REPORT_QUERY_OPTIONS,
    enabled: false,
  });

  const refetchAll = () =>
    Promise.all([
      refetchSummary(),
      refetchDetailed(),
      refetchTrend(),
      refetchLeaveList(),
      refetchInsights(),
      refetchTopTeamLeaders(),
    ]);

  return {
    summaryData,
    summaryLoading,
    detailedData,
    detailedLoading,
    trendReport,
    leaveList,
    insightsData,
    topTeamLeadersData,
    refetchAll,
  };
};
