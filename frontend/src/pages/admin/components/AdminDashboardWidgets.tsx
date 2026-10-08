import React, { Suspense, useCallback, useMemo } from "react";
import { LayoutDashboard } from "lucide-react";
import { AdminQuickLinks } from "./AdminQuickLinks";
import { ApprovalQueueWidget } from "./dashboard-widgets/ApprovalQueueWidget";
import { RecentActivityWidget } from "./dashboard-widgets/RecentActivityWidget";
import { OverviewSection } from "./dashboard-widgets/OverviewSection";
import { TrendPeriodSelect } from "./dashboard-widgets/TrendPeriodSelect";
import { TREND_PERIODS } from "./dashboard-widgets/trendTypes";
import { DashboardGrid } from "./dashboard-grid/DashboardGrid";
import { sortedWidgetIds } from "./dashboard-grid/gridLayout";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  defaultAdminLayout,
  type StoredDashboardLayout,
} from "@/components/dashboard/widgetRegistry";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { useAdminOverview } from "@/hooks/useAdminDashboardQueries";
import { useUrlParamState } from "@/hooks/useUrlParamState";
import {
  AVAILABLE_WIDGETS,
  OVERVIEW_WIDGET_IDS,
  PEOPLE_WIDGET_IDS,
  TRENDS_WIDGET_IDS,
} from "@/config/dashboardWidgets";

// Chart-heavy sections load only when one of their widgets is switched on.
const TrendsSection = React.lazy(() =>
  import("./dashboard-widgets/TrendsSection").then((m) => ({ default: m.TrendsSection }))
);
const PeopleSection = React.lazy(() =>
  import("./dashboard-widgets/PeopleSection").then((m) => ({ default: m.PeopleSection }))
);

/** Same footprint as the widget it stands in for (the cell owns the height). */
const CellFallback: React.FC = () => (
  <div
    aria-hidden
    className="border-border bg-card h-full min-h-24 animate-pulse rounded-xl border"
  />
);

const widgetTitle = (id: string) => AVAILABLE_WIDGETS.find((w) => w.id === id)?.title ?? id;

interface AuditLog {
  id: number;
  action: string;
  description: string;
}

interface AdminDashboardWidgetsProps {
  isWidgetActive: (id: string) => boolean;
  totalUsers: number;
  totalTeams: number;
  totalPending: number;
  overtimeSummary?: { total_hours?: number } | null;
  hoursData: { label: string; hours: number }[];
  statusData: { name: string; value: number }[];
  auditLogs?: AuditLog[];
  statsLoading?: boolean;
  auditLogsLoading?: boolean;
  isSuperuser?: boolean;
  /** Saved layout: reading order and, in the grid, every widget's cell. */
  layout?: StoredDashboardLayout;
  /** Edit mode (grip, resize handles, remove buttons). */
  editing?: boolean;
  /** The saved layout is still loading: do not claim the dashboard is empty yet. */
  isLoading?: boolean;
  /** A section tab (not "All") is selected, so an empty grid is not the user's doing. */
  sectionFiltered?: boolean;
  onLayoutChange?: (next: StoredDashboardLayout) => void;
  onRemoveWidget?: (id: string) => void;
  onAddWidgets?: () => void;
}

/** The trend period applies to every trend chart; without the Hours widget it sits alone. */
const StandalonePeriod: React.FC = () => {
  const [period, setPeriod] = useUrlParamState("months", TREND_PERIODS, "12");
  return (
    <div className="mb-4 flex justify-end">
      <TrendPeriodSelect value={period} onChange={setPeriod} />
    </div>
  );
};

/**
 * Every visible widget as one cell of the dashboard grid. Each cell mounts the section that
 * owns its request with only its own id switched on; the sections share one query per
 * aggregate (same query key), so this still makes one request each.
 */
export const AdminDashboardWidgets: React.FC<AdminDashboardWidgetsProps> = ({
  isWidgetActive,
  totalUsers,
  totalTeams,
  totalPending,
  overtimeSummary,
  hoursData,
  statusData,
  auditLogs,
  statsLoading,
  auditLogsLoading,
  isSuperuser = false,
  layout = defaultAdminLayout,
  editing = false,
  isLoading = false,
  sectionFiltered = false,
  onLayoutChange,
  onRemoveWidget,
  onAddWidgets,
}) => {
  // The recent-activity widget reads audit_log data the viewer may not be
  // permitted to see (plugin permission is fail-secure server-side) — hide
  // it instead of firing a guaranteed 403 (audit 2026-09-07).
  const { canView } = usePluginPermissions();
  const canViewAudit = canView("audit_log");

  // backup-status is superuser-only and has no card at all when the site has no backup data,
  // so it must not hold an empty cell in the grid.
  const backupWanted = isSuperuser && isWidgetActive("backup-status");
  const overview = useAdminOverview(backupWanted);
  const noBackupData = backupWanted && overview.isSuccess && !overview.data?.backup;

  const allowed = (id: string) =>
    isWidgetActive(id) &&
    (id !== "recent-activity" || canViewAudit) &&
    (id !== "backup-status" || (isSuperuser && !noBackupData));
  const visible = sortedWidgetIds(layout).filter(allowed);
  // A stable identity, so the grid does not re-lay itself out on every parent render.
  const visibleKey = visible.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const widgetIds = useMemo(() => visible, [visibleKey]);

  const renderWidget = useCallback(
    (id: string) => {
      const only = (x: string) => x === id;
      if ((OVERVIEW_WIDGET_IDS as readonly string[]).includes(id)) {
        return (
          <OverviewSection
            isWidgetActive={only}
            isSuperuser={isSuperuser}
            stats={{
              totalUsers,
              totalTeams,
              totalPending,
              overtimeHours: overtimeSummary?.total_hours ?? 0,
              statsLoading,
            }}
          />
        );
      }
      if ((TRENDS_WIDGET_IDS as readonly string[]).includes(id)) {
        return (
          <Suspense fallback={<CellFallback />}>
            <TrendsSection
              isWidgetActive={only}
              hoursData={hoursData}
              statsLoading={statsLoading}
            />
          </Suspense>
        );
      }
      if ((PEOPLE_WIDGET_IDS as readonly string[]).includes(id)) {
        return (
          <Suspense fallback={<CellFallback />}>
            <PeopleSection isWidgetActive={only} />
          </Suspense>
        );
      }
      switch (id) {
        case "approval-queue":
          return <ApprovalQueueWidget statusData={statusData} statsLoading={statsLoading} />;
        case "recent-activity":
          return <RecentActivityWidget auditLogs={auditLogs} isLoading={auditLogsLoading} />;
        case "shortcuts":
          return <AdminQuickLinks />;
        default:
          return null;
      }
    },
    [
      isSuperuser,
      totalUsers,
      totalTeams,
      totalPending,
      overtimeSummary?.total_hours,
      statsLoading,
      hoursData,
      statusData,
      auditLogs,
      auditLogsLoading,
    ]
  );

  if (widgetIds.length === 0) {
    if (isLoading) return null;
    return sectionFiltered ? (
      <EmptyState
        icon={LayoutDashboard}
        title="No widgets in this section"
        description="Switch to All, or turn widgets on in Customize."
      />
    ) : (
      <EmptyState
        icon={LayoutDashboard}
        title="Your dashboard is empty"
        description="Add widgets to see your admin metrics here."
        action={
          onAddWidgets && (
            <Button size="control" onClick={onAddWidgets}>
              Add widgets
            </Button>
          )
        }
      />
    );
  }

  const hasTrends = widgetIds.some((id) => (TRENDS_WIDGET_IDS as readonly string[]).includes(id));
  return (
    <>
      {hasTrends && !widgetIds.includes("hours-trend") && <StandalonePeriod />}
      <DashboardGrid
        layout={layout}
        widgetIds={widgetIds}
        editing={editing}
        titleOf={widgetTitle}
        renderWidget={renderWidget}
        onLayoutChange={onLayoutChange ?? (() => {})}
        onRemove={onRemoveWidget ?? (() => {})}
      />
    </>
  );
};
