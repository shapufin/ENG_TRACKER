import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { ticketKPIService } from "../../services/ticketKPIService";
import { generateMonthOptions } from "@/lib/monthOptions";
import type { TeamSummary } from "../../utils/teamCSVExport";

type TeamTab = "monthly" | "yearly";

export interface YearlyMemberRow {
  user_id: number;
  username: string;
  name: string;
  total_tickets: number;
  avg_resolution_hours?: number;
  sla_compliance_pct?: number;
  fields_populated?: string[];
  months_with_data?: number;
}

export interface YearlySummary {
  year: number;
  users_with_data: number;
  total_tickets: number;
  avg_resolution_hours?: number;
  sla_compliance_pct?: number;
  monthly_breakdown: Array<{
    month: string;
    total_tickets: number;
    avg_resolution_hours?: number;
  }>;
  per_user_summary: YearlyMemberRow[];
}

// fallow-ignore-next-line complexity
export const useTicketKPITeamPage = () => {
  const { user } = useAuth();
  const { isTeamLeader } = usePermissions();
  const [activeTab, setActiveTab] = useState<TeamTab>("monthly");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());

  const monthOptions = generateMonthOptions();
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - i);
  }, []);

  const { data: teamSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ["ticket_kpi", "team_summary", selectedMonth],
    queryFn: () =>
      ticketKPIService.getTeamSummary(selectedMonth).then((r) => r.data as TeamSummary),
    enabled: isTeamLeader && activeTab === "monthly",
    retry: 1,
  });

  const { data: teamTrend } = useQuery({
    queryKey: ["ticket_kpi", "team_trend", 6, selectedMonth],
    queryFn: () => ticketKPIService.getTeamTrend(6, selectedMonth),
    enabled: isTeamLeader && activeTab === "monthly",
    retry: 1,
  });

  const { data: yearlySummary, isLoading: yearlyLoading } = useQuery({
    queryKey: ["ticket_kpi", "team_yearly_summary", selectedYear],
    queryFn: () =>
      ticketKPIService.getTeamYearlySummary(selectedYear).then((r) => r.data as YearlySummary),
    enabled: isTeamLeader && activeTab === "yearly",
    retry: 1,
  });

  const stats = {
    total: teamSummary?.total_tickets ?? 0,
    members: teamSummary?.members_with_data ?? 0,
    avgRes: teamSummary?.avg_resolution_hours ?? null,
    sla: teamSummary?.sla_compliance_pct ?? null,
  };

  const yearlyStats = {
    total: yearlySummary?.total_tickets ?? 0,
    members: yearlySummary?.users_with_data ?? 0,
    avgRes: yearlySummary?.avg_resolution_hours ?? null,
    sla: yearlySummary?.sla_compliance_pct ?? null,
  };

  const trendChartData = useMemo(
    () =>
      teamTrend?.map((d) => ({
        month: d.month,
        tickets: d.total_tickets,
        avgHours: d.avg_resolution_hours ?? 0,
      })) ?? [],
    [teamTrend]
  );

  const yearlyTrendChartData = useMemo(
    () =>
      yearlySummary?.monthly_breakdown?.map((d) => ({
        month: d.month,
        tickets: d.total_tickets,
        avgHours: d.avg_resolution_hours ?? 0,
      })) ?? [],
    [yearlySummary]
  );

  const members = teamSummary?.members ?? [];
  const yearlyMembers = yearlySummary?.per_user_summary ?? [];

  return {
    user,
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
    yearlyMembers,
  };
};
