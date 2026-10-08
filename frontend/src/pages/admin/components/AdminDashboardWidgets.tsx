import React, { Suspense } from "react";
import { AdminQuickLinks } from "./AdminQuickLinks";
import { ApprovalQueueWidget } from "./dashboard-widgets/ApprovalQueueWidget";
import { RecentActivityWidget } from "./dashboard-widgets/RecentActivityWidget";
import { OverviewSection } from "./dashboard-widgets/OverviewSection";
import { GridCell, GridOrderProvider } from "./dashboard-grid/GridCell";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { PEOPLE_WIDGET_IDS, TRENDS_WIDGET_IDS } from "@/config/dashboardWidgets";

// Chart-heavy sections load only when one of their widgets is switched on.
const TrendsSection = React.lazy(() =>
  import("./dashboard-widgets/TrendsSection").then((m) => ({ default: m.TrendsSection }))
);
const PeopleSection = React.lazy(() =>
  import("./dashboard-widgets/PeopleSection").then((m) => ({ default: m.PeopleSection }))
);

const SectionFallback: React.FC = () => (
  <div
    aria-hidden
    className="border-border bg-card h-56 animate-pulse rounded-xl border md:col-span-6 lg:col-span-12"
  />
);

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
  /** Widget ids in saved reading order; without it the cells keep their DOM order. */
  order?: string[];
}

/**
 * Every active widget in ONE responsive grid (12 columns at lg, 6 at md, 1 below), so
 * rows pack without holes. Sections still own their lazy request; they only render cells.
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
  order = [],
}) => {
  // The recent-activity widget reads audit_log data the viewer may not be
  // permitted to see (plugin permission is fail-secure server-side) — hide
  // it instead of firing a guaranteed 403 (audit 2026-09-07).
  const { canView } = usePluginPermissions();
  const canViewAudit = canView("audit_log");

  return (
    <GridOrderProvider order={order}>
      <div className="grid grid-flow-dense grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12">
        <OverviewSection
          isWidgetActive={isWidgetActive}
          isSuperuser={isSuperuser}
          stats={{
            totalUsers,
            totalTeams,
            totalPending,
            overtimeHours: overtimeSummary?.total_hours ?? 0,
            statsLoading,
          }}
        />
        {isWidgetActive("approval-queue") && (
          <GridCell id="approval-queue">
            <ApprovalQueueWidget statusData={statusData} statsLoading={statsLoading} />
          </GridCell>
        )}
        {PEOPLE_WIDGET_IDS.some(isWidgetActive) && (
          <Suspense fallback={<SectionFallback />}>
            <PeopleSection isWidgetActive={isWidgetActive} />
          </Suspense>
        )}
        {TRENDS_WIDGET_IDS.some(isWidgetActive) && (
          <Suspense fallback={<SectionFallback />}>
            <TrendsSection
              isWidgetActive={isWidgetActive}
              hoursData={hoursData}
              statsLoading={statsLoading}
            />
          </Suspense>
        )}
        {isWidgetActive("recent-activity") && canViewAudit && (
          <GridCell id="recent-activity">
            <RecentActivityWidget auditLogs={auditLogs} isLoading={auditLogsLoading} />
          </GridCell>
        )}
        {isWidgetActive("shortcuts") && (
          <GridCell id="shortcuts">
            <AdminQuickLinks />
          </GridCell>
        )}
      </div>
    </GridOrderProvider>
  );
};
