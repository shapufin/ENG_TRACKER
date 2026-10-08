import React, { useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { DashboardProvider, useDashboard } from "@/context/DashboardContext";
import { usePermissions } from "@/context/PermissionContext";
import { CustomizeDashboardModal } from "@/components/admin/CustomizeDashboardModal";
import {
  ADMIN_DASHBOARD_SECTIONS,
  AVAILABLE_WIDGETS,
  widgetSection,
} from "@/config/dashboardWidgets";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminDashboardWidgets } from "./components/AdminDashboardWidgets";
import { AdminInsightsStrip } from "./components/AdminInsightsStrip";
import { DashboardActionsMenu } from "./components/DashboardActionsMenu";
import { presetLayout } from "@/config/dashboardPresets";
import { AdminDashboardFreshness } from "./components/AdminDashboardFreshness";
import { useAdminDashboardPage } from "./hooks/useAdminDashboardPage";

const AdminDashboardContent: React.FC = () => {
  const { isSuperuser } = usePermissions();
  const { updateLayout } = useDashboard();
  const widgetsRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("section");
  const section = ADMIN_DASHBOARD_SECTIONS.some((s) => s.id === requested) ? requested! : "all";
  const handleSectionChange = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("section");
    else params.set("section", next);
    setSearchParams(params, { replace: true });
  };
  const {
    resetLayout,
    customizeModalOpen,
    setCustomizeModalOpen,
    isWidgetActive: isLayoutWidgetActive,
    handleToggleWidget,
    activeWidgetIds,
    totalUsers,
    totalTeams,
    totalPending,
    overtimeSummary,
    statusData,
    hoursData,
    auditLogs,
    statsLoading,
    auditLogsLoading,
  } = useAdminDashboardPage();
  // A view filter only: the saved layout is untouched, hidden sections just stop rendering
  // (and OverviewSection mounts its request only while one of its widgets is visible).
  const isWidgetActive = (id: string) =>
    isLayoutWidgetActive(id) && (section === "all" || widgetSection(id) === section);

  return (
    <PageShell
      title="Admin Dashboard"
      subtitle="Overview of system metrics and pending actions."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <AdminDashboardFreshness />
          <DashboardActionsMenu
            containerRef={widgetsRef}
            availableWidgets={AVAILABLE_WIDGETS}
            isSuperuser={isSuperuser}
            onApplyPreset={(ids) => void updateLayout(presetLayout(ids))}
            onReset={() => resetLayout()}
            onCustomize={() => setCustomizeModalOpen(true)}
          />
        </div>
      }
    >
      <AdminInsightsStrip />
      <Tabs value={section} onValueChange={handleSectionChange}>
        <TabsList
          aria-label="Dashboard sections"
          className="max-w-full flex-nowrap justify-start overflow-x-auto"
        >
          <TabsTrigger value="all">All</TabsTrigger>
          {ADMIN_DASHBOARD_SECTIONS.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div ref={widgetsRef} className="space-y-6">
        <AdminDashboardWidgets
          isWidgetActive={isWidgetActive}
          totalUsers={totalUsers}
          totalTeams={totalTeams}
          totalPending={totalPending}
          overtimeSummary={overtimeSummary}
          hoursData={hoursData}
          statusData={statusData}
          auditLogs={auditLogs}
          statsLoading={statsLoading}
          auditLogsLoading={auditLogsLoading}
          isSuperuser={isSuperuser}
        />
      </div>
      <CustomizeDashboardModal
        open={customizeModalOpen}
        onOpenChange={setCustomizeModalOpen}
        availableWidgets={AVAILABLE_WIDGETS.filter((w) => !w.superuserOnly || isSuperuser)}
        activeWidgets={activeWidgetIds}
        onToggleWidget={handleToggleWidget}
      />
    </PageShell>
  );
};

export const AdminDashboardPage: React.FC = () => (
  <DashboardProvider dashboardType="admin">
    <AdminDashboardContent />
  </DashboardProvider>
);
