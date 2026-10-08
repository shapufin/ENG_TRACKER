import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import { DashboardEditToggle } from "./components/DashboardEditToggle";
import { AdminDashboardWidgets } from "./components/AdminDashboardWidgets";
import { AdminInsightsStrip } from "./components/AdminInsightsStrip";
import { DashboardActionsMenu } from "./components/DashboardActionsMenu";
import { presetLayout } from "@/config/dashboardPresets";
import { AdminDashboardFreshness } from "./components/AdminDashboardFreshness";
import { useAdminDashboardPage } from "./hooks/useAdminDashboardPage";

const AdminDashboardContent: React.FC = () => {
  const { isSuperuser } = usePermissions();
  const { layout, updateLayout, isLoading, saveStatus, retrySave } = useDashboard();
  const [editing, setEditing] = useState(false);
  const widgetsRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("section");
  const section = ADMIN_DASHBOARD_SECTIONS.some((s) => s.id === requested) ? requested! : "all";
  // Rearranging only makes sense with every widget on screen, so it is an All-tab feature.
  const canEdit = section === "all";
  const editActive = editing && canEdit;
  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Esc inside a dialog or menu closes that, not edit mode.
      if (e.key === "Escape" && !document.querySelector('[role="dialog"],[role="menu"]')) {
        setEditing(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing]);
  const handleSectionChange = (next: string) => {
    setEditing(false);
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
  const handleReset = async () => {
    const previous = layout;
    await resetLayout();
    toast("Dashboard reset to default", {
      duration: 8000,
      action: { label: "Undo", onClick: () => void updateLayout(previous) },
    });
  };

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
          <DashboardEditToggle
            editing={editActive}
            disabled={!canEdit}
            onToggle={() => setEditing((on) => !on)}
            saveStatus={saveStatus}
            onRetry={() => void retrySave()}
          />
          <DashboardActionsMenu
            containerRef={widgetsRef}
            availableWidgets={AVAILABLE_WIDGETS}
            isSuperuser={isSuperuser}
            onApplyPreset={(ids) => void updateLayout(presetLayout(ids))}
            onReset={() => void handleReset()}
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
          layout={layout}
          editing={editActive}
          isLoading={isLoading}
          sectionFiltered={section !== "all"}
          onLayoutChange={(next) => void updateLayout(next)}
          onRemoveWidget={handleToggleWidget}
          onAddWidgets={() => setCustomizeModalOpen(true)}
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
