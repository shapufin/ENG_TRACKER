import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { extractResponseResults } from "@/lib/api-utils";
import { buildAnalyticsParams } from "@/lib/analytics-params";
import { toLocalISODate } from "@/lib/date-format-utils";
import type { PaginatedResponse } from "@/types";
import type {
  AnalyticsData,
  TeamOption,
  UserOption,
  Hotspot,
  AnalyticsTrends,
  AnalyticsInsight,
} from "@/components/analytics/types";

const PERIODS = ["week", "month", "year", "custom"] as const;
export type Period = (typeof PERIODS)[number];

/**
 * Debounce a value by `delay` ms. Used to batch rapid filter changes
 * (e.g. toggling multiple checkboxes) before they trigger API refetches.
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, delay]);
  return debounced;
}

export const useAnalyticsPage = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("month");
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    // eslint-disable-next-line react-hooks/purity
    from: toLocalISODate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    to: toLocalISODate(new Date()),
  });
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<"excel" | "csv">("excel");
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Debounce filter state so rapid toggles (e.g. checking 10 users in
  // quick succession) batch into a single API refetch, not 10.
  const debouncedTeams = useDebouncedValue(selectedTeams, 300);
  const debouncedUsers = useDebouncedValue(selectedUsers, 300);
  const debouncedStatuses = useDebouncedValue(selectedStatuses, 300);
  const debouncedCategories = useDebouncedValue(selectedCategories, 300);

  const { data: teams } = useQuery({
    queryKey: ["teams-list"],
    queryFn: async () => {
      const response = await api.get<TeamOption[] | PaginatedResponse<TeamOption>>("/users/teams/");
      return extractResponseResults(response);
    },
  });

  const { data: usersList } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => {
      const response = await api.get<UserOption[] | PaginatedResponse<UserOption>>("/users/users/");
      return extractResponseResults(response);
    },
  });

  const {
    data: analytics,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      "analytics",
      selectedPeriod,
      dateRange,
      debouncedTeams,
      debouncedUsers,
      debouncedStatuses,
      debouncedCategories,
    ],
    queryFn: async () => {
      const params = buildAnalyticsParams(
        selectedPeriod,
        dateRange,
        debouncedTeams,
        debouncedUsers,
        debouncedStatuses,
        debouncedCategories
      );
      const response = await api.get(`plugins/analytics/metrics/?${params.toString()}`);
      return response.data as AnalyticsData;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const { data: hotspotsData } = useQuery({
    queryKey: ["analytics-hotspots", selectedPeriod],
    queryFn: async () => {
      const response = await api.get(
        `plugins/analytics/metrics/hotspots/?period=${selectedPeriod}`
      );
      return response.data as Hotspot[];
    },
  });

  const { data: trends } = useQuery({
    queryKey: [
      "analytics-trends",
      selectedPeriod,
      dateRange,
      debouncedTeams,
      debouncedUsers,
      debouncedStatuses,
      debouncedCategories,
    ],
    queryFn: async () => {
      const params = buildAnalyticsParams(
        selectedPeriod,
        dateRange,
        debouncedTeams,
        debouncedUsers,
        debouncedStatuses,
        debouncedCategories
      );
      const response = await api.get(`plugins/analytics/metrics/trends/?${params.toString()}`);
      return response.data as AnalyticsTrends;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: [
      "analytics-insights",
      selectedPeriod,
      dateRange,
      debouncedTeams,
      debouncedUsers,
      debouncedStatuses,
      debouncedCategories,
    ],
    queryFn: async () => {
      const params = buildAnalyticsParams(
        selectedPeriod,
        dateRange,
        debouncedTeams,
        debouncedUsers,
        debouncedStatuses,
        debouncedCategories
      );
      const response = await api.get(`plugins/analytics/metrics/insights/?${params.toString()}`);
      return response.data as AnalyticsInsight[];
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const activeFilterCount =
    selectedTeams.length +
    selectedUsers.length +
    selectedStatuses.length +
    selectedCategories.length;

  const clearFilters = () => {
    setSelectedTeams([]);
    setSelectedUsers([]);
    setSelectedStatuses([]);
    setSelectedCategories([]);
  };

  return {
    PERIODS,
    selectedPeriod,
    setSelectedPeriod,
    dateRange,
    setDateRange,
    selectedTeams,
    setSelectedTeams,
    selectedUsers,
    setSelectedUsers,
    selectedStatuses,
    setSelectedStatuses,
    selectedCategories,
    setSelectedCategories,
    exportFormat,
    setExportFormat,
    configModalOpen,
    setConfigModalOpen,
    showFilters,
    setShowFilters,
    teams,
    usersList,
    analytics,
    isLoading,
    error,
    hotspotsData,
    trends,
    insights,
    insightsLoading,
    activeFilterCount,
    clearFilters,
    buildAnalyticsParams,
  };
};
