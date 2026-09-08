import { useState } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useDashboard } from "@/context/DashboardContext";
import { useAdminDashboardQueries } from "@/hooks/useAdminDashboardQueries";

/**
 * Orchestrates the Admin Dashboard page: widget layout state from
 * DashboardContext, DnD sensors, toggle/drag handlers, and the data
 * queries. Keeps AdminDashboardPage a thin composition root.
 */
export const useAdminDashboardPage = () => {
  const { layout, resetLayout, addWidget, removeWidget, reorderWidgets } = useDashboard();
  const [customizeModalOpen, setCustomizeModalOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = layout.widgets.findIndex((w) => w.id === active.id);
      const newIndex = layout.widgets.findIndex((w) => w.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderWidgets(oldIndex, newIndex);
      }
    }
  };

  return {
    resetLayout,
    sensors,
    customizeModalOpen,
    setCustomizeModalOpen,
    isWidgetActive,
    handleToggleWidget,
    handleDragEnd,
    activeWidgetIds,
    ...queries,
  };
};
