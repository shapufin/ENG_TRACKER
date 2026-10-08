import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { DashboardProvider } from "@/context/DashboardContext";
import { usePermissions } from "@/context/PermissionContext";
import type { DashboardType } from "@/context/permission-context-base";
import { DashboardSwitcher } from "@/components/dashboard/DashboardSwitcher";
import { CustomizeDashboardModal } from "@/components/admin/CustomizeDashboardModal";
import {
  ADMIN_DASHBOARD_SECTIONS,
  AVAILABLE_WIDGETS,
  widgetSection,
} from "@/config/dashboardWidgets";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminDashboardWidgets } from "./components/AdminDashboardWidgets";
import { AdminInsightsStrip } from "./components/AdminInsightsStrip";
import { AdminDashboardFreshness } from "./components/AdminDashboardFreshness";
import { useAdminDashboardPage } from "./hooks/useAdminDashboardPage";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

const AdminDashboardContent: React.FC = () => {
  const { availableDashboards, isSuperuser } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("section");
  const section = ADMIN_DASHBOARD_SECTIONS.some((s) => s.id === requested) ? requested! : "all";
  const handleSectionChange = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("section");
    else params.set("section", next);
    setSearchParams(params, { replace: true });
  };
  // The admin dashboard lives at /admin; every other dashboard lives at /.
  // Persist the choice (DashboardPage hydrates from the same key) then go.
  const handleDashboardChange = (dashboard: DashboardType) => {
    if (dashboard === "admin") return;
    try {
      localStorage.setItem("selectedDashboard", dashboard);
    } catch {
      /* ignore */
    }
    navigate("/");
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
        <div className="flex flex-wrap items-center gap-3">
          <DashboardSwitcher
            availableDashboards={availableDashboards}
            selectedDashboard="admin"
            onDashboardChange={handleDashboardChange}
          />
          <AdminDashboardFreshness />
          <Button variant="outline" size="sm" onClick={() => resetLayout()}>
            Reset to Default
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCustomizeModalOpen(true)}>
            <Settings className="mr-2 h-4 w-4" /> Customize Dashboard
          </Button>
        </div>
      }
    >
      <AdminInsightsStrip />
      <Tabs value={section} onValueChange={handleSectionChange}>
        <TabsList
          aria-label="Dashboard sections"
          className="h-auto max-w-full flex-nowrap justify-start overflow-x-auto"
        >
          <TabsTrigger value="all">All</TabsTrigger>
          {ADMIN_DASHBOARD_SECTIONS.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
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
