/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrendingUp } from "lucide-react";
import type { DetailedUserReport } from "@/services/reportService";
import { HRInsightsCard } from "./HRInsightsCard";
import { HRTopLeadersCard } from "./HRTopLeadersCard";
import { HRTrendChart } from "./HRTrendChart";
import { HRSearchControls } from "./HRSearchControls";
import { HRPersonnelTable } from "./HRPersonnelTable";
import { HRLeaveTable } from "./HRLeaveTable";

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
  overtime_increase: number;
  leave_utilization: number;
  standby_coverage: number;
}

interface HRReportResultsProps {
  hasGenerated: boolean;
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
}

export const HRReportResults: React.FC<HRReportResultsProps> = ({
  hasGenerated,
  isLoading,
  insightsData,
  topTeamLeadersData,
  trendData,
  detailedData,
  leaveList,
  searchQuery,
  onSearchQueryChange,
}) => {
  if (!hasGenerated) {
    return (
      <GlassCard isHoverLift={false}>
        <EmptyState
          icon={TrendingUp}
          title="HR Strategic Analysis"
          description="Filter by Team Leaders and date range to analyze organizational performance."
        />
      </GlassCard>
    );
  }

  if (isLoading)
    return (
      <div className="space-y-6">
        {/* Skeleton insights row */}
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <GlassCard key={i} delay={i * 0.05}>
              <div className="p-4">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-8 w-16 animate-pulse rounded bg-muted" />
              </div>
            </GlassCard>
          ))}
        </div>
        {/* Skeleton table */}
        <GlassCard className="overflow-hidden p-0">
          <div className="border-b bg-muted/20 p-4">
            <div className="h-5 w-48 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-3 p-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded bg-muted/60" />
            ))}
          </div>
        </GlassCard>
      </div>
    );

  const filteredUsersData = (detailedData?.users || []).filter((u) => {
    const s = searchQuery.toLowerCase();
    return u.full_name.toLowerCase().includes(s) || u.username.toLowerCase().includes(s);
  });

  const filteredLeaveList = (leaveList?.results || []).filter((v) => {
    const s = searchQuery.toLowerCase();
    return (v.user_full_name || v.user_name || "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      {insightsData && <HRInsightsCard insightsData={insightsData} />}
      {topTeamLeadersData && topTeamLeadersData.length > 0 && (
        <HRTopLeadersCard leaders={topTeamLeadersData} />
      )}
      {trendData.length > 0 && <HRTrendChart data={trendData} />}
      <div className="space-y-4">
        <HRSearchControls searchQuery={searchQuery} onSearchQueryChange={onSearchQueryChange} />
        <div className="space-y-6">
          <HRPersonnelTable users={filteredUsersData} />
          <HRLeaveTable leaves={filteredLeaveList} />
        </div>
      </div>
    </div>
  );
};
