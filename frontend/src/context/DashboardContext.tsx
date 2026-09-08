import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { dashboardService } from "@/services/dashboardService";
import { defaultAdminLayout } from "@/components/dashboard/widgetRegistry";

interface DashboardLayout {
  widgets: Array<{
    id: string;
    position: { x: number; y: number };
    size: { w: number; h: number };
  }>;
  columns: number;
}

interface DashboardContextValue {
  layout: DashboardLayout;
  isLoading: boolean;
  updateLayout: (layout: DashboardLayout) => Promise<void>;
  resetLayout: () => Promise<void>;
  addWidget: (widgetId: string) => void;
  removeWidget: (widgetId: string) => void;
  reorderWidgets: (fromIndex: number, toIndex: number) => void;
}

const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within DashboardProvider");
  }
  return context;
};

interface DashboardProviderProps {
  dashboardType: string;
  children: React.ReactNode;
}

export const DashboardProvider: React.FC<DashboardProviderProps> = ({
  dashboardType,
  children,
}) => {
  const [layout, setLayout] = useState<DashboardLayout>(defaultAdminLayout);
  const [isLoading, setIsLoading] = useState(true);

  // Load layout from backend on mount
  useEffect(() => {
    const loadLayout = async () => {
      try {
        const savedLayout = await dashboardService.getDashboardLayout(dashboardType);
        if (savedLayout && savedLayout.layout) {
          setLayout(savedLayout.layout);
        }
      } catch (error) {
        console.error("Failed to load dashboard layout:", error);
        // Use default layout on error
      } finally {
        setIsLoading(false);
      }
    };

    loadLayout();
  }, [dashboardType]);

  const updateLayout = useCallback(
    async (newLayout: DashboardLayout) => {
      setLayout(newLayout);
      try {
        await dashboardService.saveDashboardLayout(newLayout, dashboardType);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        console.error("Failed to save dashboard layout:", error);
      }
    },
    [dashboardType]
  );

  const resetLayout = useCallback(async () => {
    setLayout(defaultAdminLayout);
    try {
      await dashboardService.resetDashboardLayout(dashboardType);
    } catch (error) {
      console.error("Failed to reset dashboard layout:", error);
    }
  }, [dashboardType]);

  const addWidget = useCallback(
    (widgetId: string) => {
      setLayout((prev) => {
        const newWidget = {
          id: widgetId,
          position: { x: 0, y: prev.widgets.length },
          size: { w: 1, h: 1 },
        };
        const newLayout = {
          ...prev,
          widgets: [...prev.widgets, newWidget],
        };
        // Persist to backend
        dashboardService.saveDashboardLayout(newLayout, dashboardType).catch((error) => {
          console.error("Failed to save widget addition:", error);
        });
        return newLayout;
      });
    },
    [dashboardType]
  );

  const removeWidget = useCallback(
    (widgetId: string) => {
      setLayout((prev) => {
        const newLayout = {
          ...prev,
          widgets: prev.widgets.filter((w) => w.id !== widgetId),
        };
        // Persist to backend
        dashboardService.saveDashboardLayout(newLayout, dashboardType).catch((error) => {
          console.error("Failed to save widget removal:", error);
        });
        return newLayout;
      });
    },
    [dashboardType]
  );

  const reorderWidgets = useCallback((fromIndex: number, toIndex: number) => {
    setLayout((prev) => {
      const newWidgets = [...prev.widgets];
      const [removed] = newWidgets.splice(fromIndex, 1);
      newWidgets.splice(toIndex, 0, removed);
      return {
        ...prev,
        widgets: newWidgets,
      };
    });
  }, []);

  const value: DashboardContextValue = {
    layout,
    isLoading,
    updateLayout,
    resetLayout,
    addWidget,
    removeWidget,
    reorderWidgets,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
};
