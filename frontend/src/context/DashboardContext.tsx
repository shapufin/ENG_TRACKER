import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
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
  // Latest layout, readable synchronously so back-to-back toggles build on each
  // other instead of on a stale render, and saves queue up (each save is a
  // GET + PUT, so overlapping ones would race and drop the last toggles).
  const layoutRef = useRef<DashboardLayout>(defaultAdminLayout);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const commit = useCallback(
    (next: DashboardLayout, failure: string): Promise<unknown> => {
      layoutRef.current = next;
      setLayout(next);
      const saved = saveQueue.current
        .then(() => dashboardService.saveDashboardLayout(next, dashboardType))
        .catch((error) => console.error(failure, error));
      saveQueue.current = saved;
      return saved;
    },
    [dashboardType]
  );

  // Load layout from backend on mount
  useEffect(() => {
    const loadLayout = async () => {
      try {
        const savedLayout = await dashboardService.getDashboardLayout(dashboardType);
        // The preferences endpoint is paginated: the saved row is results[0].
        const saved = savedLayout?.results?.[0]?.layout ?? savedLayout?.layout;
        if (saved) {
          layoutRef.current = saved;
          setLayout(saved);
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
      await commit(newLayout, "Failed to save dashboard layout:");
    },
    [commit]
  );

  const resetLayout = useCallback(async () => {
    layoutRef.current = defaultAdminLayout;
    setLayout(defaultAdminLayout);
    try {
      await dashboardService.resetDashboardLayout(dashboardType);
    } catch (error) {
      console.error("Failed to reset dashboard layout:", error);
    }
  }, [dashboardType]);

  const addWidget = useCallback(
    (widgetId: string) => {
      const prev = layoutRef.current;
      commit(
        {
          ...prev,
          widgets: [
            ...prev.widgets,
            { id: widgetId, position: { x: 0, y: prev.widgets.length }, size: { w: 1, h: 1 } },
          ],
        },
        "Failed to save widget addition:"
      );
    },
    [commit]
  );

  const removeWidget = useCallback(
    (widgetId: string) => {
      const prev = layoutRef.current;
      commit(
        { ...prev, widgets: prev.widgets.filter((w) => w.id !== widgetId) },
        "Failed to save widget removal:"
      );
    },
    [commit]
  );

  const value: DashboardContextValue = {
    layout,
    isLoading,
    updateLayout,
    resetLayout,
    addWidget,
    removeWidget,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
};
