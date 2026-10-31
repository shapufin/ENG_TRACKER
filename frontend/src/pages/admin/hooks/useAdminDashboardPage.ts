import { useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { useAdminDashboardQueries } from "@/hooks/useAdminDashboardQueries";

/**
 * Orchestrates the Admin Dashboard page: widget layout state from
 * DashboardContext, toggle handlers, and the data queries. Keeps
 * AdminDashboardPage a thin composition root.
 */
export const useAdminDashboardPage = () => {
  const { layout, isLoading, resetLayout, addWidget, removeWidget } = useDashboard();
  const [customizeModalOpen, setCustomizeModalOpen] = useState(false);

  const activeWidgetIds = layout.widgets.map((w) => w.id);
  // global_stats feeds only the KPI strip and the approval-queue status tab.
  const queries = useAdminDashboardQueries(
    activeWidgetIds.some((id) => id === "kpi-strip" || id === "approval-queue")
  );
  // Nothing is active until the saved layout has loaded: the provisional default layout would
  // otherwise mount widgets (and fire their section requests) that the saved one then removes.
  const isWidgetActive = (widgetId: string) => !isLoading && activeWidgetIds.includes(widgetId);

  const handleToggleWidget = (widgetId: string) => {
    if (activeWidgetIds.includes(widgetId)) {
      removeWidget(widgetId);
    } else {
      addWidget(widgetId);
    }
  };

  return {
    resetLayout,
    customizeModalOpen,
    setCustomizeModalOpen,
    isWidgetActive,
    handleToggleWidget,
    activeWidgetIds,
    ...queries,
  };
};
