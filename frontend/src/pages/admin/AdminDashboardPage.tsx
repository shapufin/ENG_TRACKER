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
import { useIsMobile } from "@/hooks/useIsMobile";
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
  const editToggleRef = useRef<HTMLButtonElement>(null);
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("section");
  const section = ADMIN_DASHBOARD_SECTIONS.some((s) => s.id === requested) ? requested! : "all";
  // Rearranging only makes sense with every widget on screen, so it is an All-tab feature.
  const canEdit = section === "all";
  // There is no grid to edit on a phone either (the toggle is hidden there).
  const editable = canEdit && !isLoading && !isMobile;
  // A tab change from outside (history, a link) or a narrow viewport ends edit mode too.
  if (editing && !editable) setEditing(false);
  const editActive = editing && editable;
  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Esc inside a dialog or menu closes that, and one a widget handled (dropping a grabbed
      // widget) is not meant for edit mode.
      if (
        e.key === "Escape" &&
        !e.defaultPrevented &&
        !document.querySelector('[role="dialog"],[role="menu"]')
      ) {
        setEditing(false);
        // The grip that had focus is about to unmount: hand focus to the toggle.
        editToggleRef.current?.focus();
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
    if (!(await resetLayout())) {
      toast.error("Couldn't reset the dashboard. Try again.");
      return;
    }
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
            buttonRef={editToggleRef}
            editing={editActive}
            disabled={!canEdit || isLoading}
            disabledReason={canEdit ? "Loading your layout…" : undefined}
            onToggle={() => setEditing((on) => !on)}
            saveStatus={saveStatus}
            onRetry={() => void retrySave()}
          />
          <DashboardActionsMenu
            containerRef={widgetsRef}
            availableWidgets={AVAILABLE_WIDGETS}
            isSuperuser={isSuperuser}
            disabled={isLoading}
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
