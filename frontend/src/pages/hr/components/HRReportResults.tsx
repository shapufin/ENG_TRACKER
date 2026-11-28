/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { DetailedUserReport } from "@/services/reportService";
import { HRInsightsCard, type HRKpiSortKey } from "./HRInsightsCard";
import { HRTeamLeaderBarList } from "./HRTeamLeaderBarList";
import { HRTrendChart } from "./HRTrendChart";
import { HRSearchControls } from "./HRSearchControls";
import { HRPersonnelTable, type SortPreset } from "./HRPersonnelTable";
import { HRLeaveTable } from "./HRLeaveTable";

const userHasPending = (u: DetailedUserReport) =>
  (u.overtime?.pending_hours ?? 0) > 0 ||
  (u.standby?.pending_hours ?? 0) > 0 ||
  (u.leave?.pending_days ?? 0) > 0;

interface TrendItem {
  month?: string;
  year?: string;
  overtime?: number;
  standby?: number;
  leave?: number;
}
interface LeaderItem {
  id: number;
  rank: number;
  name: string;
  team_name?: string | null;
  total_hours: number;
}
interface LeaveItem {
  id: number;
  user_full_name?: string;
  user_name?: string;
  request_type_display?: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  status_display?: string;
}
interface InsightsData {
  overtime_increase: number | null;
  leave_utilization: number | null;
  standby_hours: number;
}

interface HRReportResultsProps {
  isLoading: boolean;
  insightsData?: InsightsData | null;
  topTeamLeadersData?: LeaderItem[] | null;
  trendData: TrendItem[];
  detailedData?: {
    overtime?: any[];
    standby?: any[];
    leave?: any[];
    users?: DetailedUserReport[];
  } | null;
  leaveList?: { results?: LeaveItem[] } | null;
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
  /** Leader (Manager id) currently filtering the report, highlighted in the ranking. */
  selectedLeaderId?: number | null;
  /** Click on a leader in the ranking. */
  onSelectLeader?: (leaderId: number) => void;
}

export const HRReportResults: React.FC<HRReportResultsProps> = ({
  isLoading,
  insightsData,
  topTeamLeadersData,
  trendData,
  detailedData,
  leaveList,
  searchQuery,
  onSearchQueryChange,
  selectedLeaderId,
  onSelectLeader,
}) => {
  const [sortPreset, setSortPreset] = useState<SortPreset>("name");
  const [onlyWithPending, setOnlyWithPending] = useState(false);

  const users = useMemo(() => detailedData?.users ?? [], [detailedData?.users]);
  const pendingPeopleCount = useMemo(() => users.filter(userHasPending).length, [users]);
  const pendingHoursTotal = useMemo(
    () =>
      users.reduce(
        (sum, u) => sum + (u.overtime?.pending_hours ?? 0) + (u.standby?.pending_hours ?? 0),
        0
      ),
    [users]
  );

  const handleKpiSort = (key: HRKpiSortKey) => {
    setSortPreset((prev) => (prev === key ? "name" : key));
  };

  if (isLoading)
    return (
      <div className="space-y-6">
        {/* Skeleton insights strip */}
        <GlassCard className="overflow-hidden p-0">
          <div className="divide-border/60 grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="p-4">
                <div className="bg-muted h-4 w-24 animate-pulse rounded" />
                <div className="bg-muted mt-3 h-8 w-16 animate-pulse rounded" />
              </div>
            ))}
          </div>
        </GlassCard>
        {/* Skeleton table */}
        <GlassCard className="overflow-hidden p-0">
          <div className="bg-muted/20 border-b p-4">
            <div className="bg-muted h-5 w-48 animate-pulse rounded" />
          </div>
          <div className="space-y-3 p-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-muted/60 h-10 w-full animate-pulse rounded" />
            ))}
          </div>
        </GlassCard>
      </div>
    );

  const filteredLeaveList = (leaveList?.results || []).filter((v) => {
    const s = searchQuery.toLowerCase();
    return (v.user_full_name || v.user_name || "").toLowerCase().includes(s);
  });

  const hasLeaders = !!topTeamLeadersData && topTeamLeadersData.length > 0;
  const hasTrend = trendData.length > 0;

  return (
    <div className="space-y-6">
      {insightsData && (
        <HRInsightsCard
          insightsData={insightsData}
          activeSort={sortPreset}
          onlyWithPending={onlyWithPending}
          pendingPeopleCount={pendingPeopleCount}
          totalPeopleCount={users.length}
          pendingHoursTotal={pendingHoursTotal}
          onSortClick={handleKpiSort}
          onTogglePending={() => setOnlyWithPending((v) => !v)}
        />
      )}
      {(hasLeaders || hasTrend) && (
        <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-12">
          {hasLeaders && (
            <div className={hasTrend ? "lg:col-span-5" : "lg:col-span-12"}>
              <HRTeamLeaderBarList
                leaders={topTeamLeadersData!}
                onSelect={onSelectLeader}
                selectedId={selectedLeaderId}
              />
            </div>
          )}
          {hasTrend && (
            <div className={hasLeaders ? "lg:col-span-7" : "lg:col-span-12"}>
              <HRTrendChart data={trendData} />
            </div>
          )}
        </div>
      )}
      <HRPersonnelTable
        users={users}
        sortPreset={sortPreset}
        onSortPresetChange={setSortPreset}
        onlyWithPending={onlyWithPending}
        onOnlyWithPendingChange={setOnlyWithPending}
      />
      <div className="space-y-4">
        <HRSearchControls searchQuery={searchQuery} onSearchQueryChange={onSearchQueryChange} />
        <HRLeaveTable leaves={filteredLeaveList} />
      </div>
    </div>
  );
};
