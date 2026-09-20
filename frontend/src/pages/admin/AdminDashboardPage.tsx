import React from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useNavigate } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { DashboardProvider } from "@/context/DashboardContext";
import { usePermissions } from "@/context/PermissionContext";
import type { DashboardType } from "@/context/permission-context-base";
import { DashboardSwitcher } from "@/components/dashboard/DashboardSwitcher";
import { CustomizeDashboardModal } from "@/components/admin/CustomizeDashboardModal";
import { AVAILABLE_WIDGETS } from "@/config/dashboardWidgets";
import { AdminDashboardWidgets } from "./components/AdminDashboardWidgets";
import { useAdminDashboardPage } from "./hooks/useAdminDashboardPage";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

const AdminDashboardContent: React.FC = () => {
  const { availableDashboards } = usePermissions();
  const navigate = useNavigate();
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
    sensors,
    customizeModalOpen,
    setCustomizeModalOpen,
    isWidgetActive,
    handleToggleWidget,
    handleDragEnd,
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
          <Button variant="outline" size="sm" onClick={() => resetLayout()}>
            Reset to Default
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCustomizeModalOpen(true)}>
            <Settings className="mr-2 h-4 w-4" /> Customize Dashboard
          </Button>
        </div>
      }
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={activeWidgetIds} strategy={verticalListSortingStrategy}>
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
          />
        </SortableContext>
      </DndContext>
      <CustomizeDashboardModal
        open={customizeModalOpen}
        onOpenChange={setCustomizeModalOpen}
        availableWidgets={AVAILABLE_WIDGETS}
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
