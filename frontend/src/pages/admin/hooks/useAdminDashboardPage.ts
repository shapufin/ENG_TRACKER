import { useState } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { useAdminDashboardQueries } from "@/hooks/useAdminDashboardQueries";

/**
 * Orchestrates the Admin Dashboard page: widget layout state from
 * DashboardContext, toggle handlers, and the data queries. Keeps
 * AdminDashboardPage a thin composition root.
 */
export const useAdminDashboardPage = () => {
  const { layout, resetLayout, addWidget, removeWidget } = useDashboard();
  const [customizeModalOpen, setCustomizeModalOpen] = useState(false);

  const queries = useAdminDashboardQueries();

  const activeWidgetIds = layout.widgets.map((w) => w.id);
  const isWidgetActive = (widgetId: string) => activeWidgetIds.includes(widgetId);

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
