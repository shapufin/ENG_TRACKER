import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useMemberIdentity } from "./useMemberIdentity";
import { ticketKPIService } from "../../services/ticketKPIService";
import type { StatusGroupFilter } from "../../components/BreakdownSection";
import { getInitialMonth, buildStats, buildTrendChartData } from "./ticketKPIDashboardHelpers";
import { currentBusinessYear } from "@/lib/date-format-utils";

const STATUS_GROUPS: StatusGroupFilter[] = ["open", "closed", "cancelled", "other"];

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
  const selectedYear = queryYear ? Number(queryYear) : currentBusinessYear();

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
          if (!next.get("year")) next.set("year", String(currentBusinessYear()));
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

  // Filters for the breakdown lists only (not the totals); kept in the URL so a
  // filtered view survives a reload and can be shared.
  const rawGroup = searchParams.get("group");
  const breakdownGroup: StatusGroupFilter | null = STATUS_GROUPS.includes(
    rawGroup as StatusGroupFilter
  )
    ? (rawGroup as StatusGroupFilter)
    : null;
  const breakdownClient = Number(searchParams.get("client")) || null;
  const setBreakdownParam = useCallback(
    (key: "group" | "client", value: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      });
    },
    [setSearchParams]
  );
  const setBreakdownGroup = useCallback(
    (group: StatusGroupFilter | null) => setBreakdownParam("group", group),
    [setBreakdownParam]
  );
  const setBreakdownClient = useCallback(
    (clientId: number | null) => setBreakdownParam("client", clientId ? String(clientId) : null),
    [setBreakdownParam]
  );

  const { data: categoryData } = useQuery({
    queryKey: [
      "ticket_kpi",
      "categories",
      selectedMonth,
      viewUserId ?? user?.id,
      breakdownClient,
      breakdownGroup,
    ],
    queryFn: () =>
      ticketKPIService
        .getCategories(selectedMonth, viewUserId, {
          clientId: breakdownClient,
          statusGroup: breakdownGroup,
        })
        .then((r) => r.data),
    retry: 1,
  });

  const { data: batches } = useQuery({
    queryKey: ["ticket_kpi", "my_batches", viewUserId],
    queryFn: () => ticketKPIService.getMyBatches(),
    enabled: !isFilteredView,
  });

  // The member's name for the filtered view header (a leader cannot read the
  // user record directly, so this goes through the squad list).
  const { name: viewUserDisplayName } = useMemberIdentity(viewUserId);

  const hasData = monthlyKPI?.has_data || (trendData && trendData.length > 0);

  const stats = buildStats(monthlyKPI);
  const trendChartData = buildTrendChartData(trendData);

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
    viewUserDisplayName,
    monthlyKPI,
    kpiLoading,
    trendData,
    categoryData,
    batches,
    hasData,
    stats,
    trendChartData,
    breakdownGroup,
    breakdownClient,
    setBreakdownGroup,
    setBreakdownClient,
    fieldBreakdowns: monthlyKPI?.field_breakdowns || {},
  };
};
