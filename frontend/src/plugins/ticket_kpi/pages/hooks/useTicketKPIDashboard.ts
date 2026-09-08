import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { userService } from "@/services/userService";
import { ticketKPIService } from "../../services/ticketKPIService";
import {
  getInitialMonth,
  buildStats,
  buildTrendChartData,
  buildCategoryChartData,
} from "./ticketKPIDashboardHelpers";

// fallow-ignore-next-line complexity
export const useTicketKPIDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const queryUserId = searchParams.get("user_id");
  const queryMonth = searchParams.get("month");
  const queryYear = searchParams.get("year");
  const queryViewMode = searchParams.get("view");
  const viewUserId = queryUserId ? Number(queryUserId) : undefined;
  const isFilteredView = !!viewUserId;

  const selectedMonth = useMemo(() => getInitialMonth(queryMonth), [queryMonth]);
  const [months] = useState(12);

  // View mode for the ticket records table: "month" (default) or "year"
  const viewMode: "month" | "year" = queryViewMode === "year" ? "year" : "month";
  const selectedYear = queryYear ? Number(queryYear) : new Date().getFullYear();

  const setSelectedMonth = useCallback(
    (month: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("month", month);
        return next;
      });
    },
    [setSearchParams]
  );

  const setViewMode = useCallback(
    (mode: "month" | "year") => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (mode === "year") {
          next.set("view", "year");
          if (!next.get("year")) next.set("year", String(new Date().getFullYear()));
        } else {
          next.delete("view");
          next.delete("year");
        }
        return next;
      });
    },
    [setSearchParams]
  );

  const setSelectedYear = useCallback(
    (year: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("year", String(year));
        return next;
      });
    },
    [setSearchParams]
  );

  // Compute the previous month for period-over-period comparison.
  // Format: "YYYY-MM-01" (first day of the previous month).
  const compareMonth = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const d = new Date(year, month - 1, 1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, [selectedMonth]);

  const { data: monthlyKPI, isLoading: kpiLoading } = useQuery({
    queryKey: [
      "ticket_kpi",
      "monthly_summary",
      selectedMonth,
      compareMonth,
      viewUserId ?? user?.id,
    ],
    queryFn: () =>
      ticketKPIService
        .getMonthlySummary(selectedMonth, viewUserId, compareMonth)
        .then((r) => r.data),
    retry: 1,
  });

  const { data: trendData } = useQuery({
    queryKey: ["ticket_kpi", "trend", months, viewUserId ?? user?.id],
    queryFn: () => ticketKPIService.getTrend(months, viewUserId),
    retry: 1,
  });

  const { data: categoryData } = useQuery({
    queryKey: ["ticket_kpi", "categories", selectedMonth, viewUserId ?? user?.id],
    queryFn: () => ticketKPIService.getCategories(selectedMonth, viewUserId).then((r) => r.data),
    retry: 1,
  });

  const { data: batches } = useQuery({
    queryKey: ["ticket_kpi", "my_batches", viewUserId],
    queryFn: () => ticketKPIService.getMyBatches(),
    enabled: !isFilteredView,
  });

  // Fetch the target user's details (name, username) for the filtered view header
  const { data: viewUser } = useQuery({
    queryKey: ["users", "detail", viewUserId],
    queryFn: () => userService.getUser(viewUserId!),
    enabled: isFilteredView,
  });

  const viewUserDisplayName = viewUser
    ? `${viewUser.first_name} ${viewUser.last_name}`.trim() || viewUser.username
    : undefined;

  const hasData = monthlyKPI?.has_data || (trendData && trendData.length > 0);

  const stats = buildStats(monthlyKPI);
  const trendChartData = buildTrendChartData(trendData);
  const categoryChartData = buildCategoryChartData(categoryData);

  return {
    selectedMonth,
    setSelectedMonth,
    months,
    viewMode,
    selectedYear,
    setViewMode,
    setSelectedYear,
    isFilteredView,
    viewUserId,
    viewUser,
    viewUserDisplayName,
    monthlyKPI,
    kpiLoading,
    trendData,
    categoryData,
    batches,
    hasData,
    stats,
    trendChartData,
    categoryChartData,
    fieldBreakdowns: monthlyKPI?.field_breakdowns || {},
  };
};
