import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { dashboardService } from "@/services/dashboardService";
import {
  adminWidgetPlacement,
  defaultAdminLayout,
  type StoredDashboardLayout,
} from "@/components/dashboard/widgetRegistry";
import { migrateLayout } from "@/pages/admin/components/dashboard-grid/gridLayout";

type DashboardLayout = StoredDashboardLayout;

/** State of the ordered save queue: nothing yet, in flight, all saved, or the last save failed. */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface DashboardContextValue {
  layout: DashboardLayout;
  isLoading: boolean;
  saveStatus: SaveStatus;
  /** Saves the current layout again (after a failed save). */
  retrySave: () => Promise<void>;
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const pendingSaves = useRef(0);
  const saveFailed = useRef(false);
  const commit = useCallback(
    (next: DashboardLayout, failure: string): Promise<unknown> => {
      layoutRef.current = next;
      setLayout(next);
      pendingSaves.current += 1;
      // A newer layout supersedes an earlier failure.
      saveFailed.current = false;
      setSaveStatus("saving");
      const saved = saveQueue.current
        .then(() => dashboardService.saveDashboardLayout(next, dashboardType))
        .catch((error) => {
          saveFailed.current = true;
          console.error(failure, error);
        })
        .finally(() => {
          pendingSaves.current -= 1;
          if (pendingSaves.current === 0) setSaveStatus(saveFailed.current ? "error" : "saved");
        });
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
          // Only the admin dashboard moved to the merged 12-column widgets; the others
          // keep whatever they stored.
          const loaded = dashboardType === "admin" ? migrateLayout(saved) : saved;
          layoutRef.current = loaded;
          setLayout(loaded);
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

  const retrySave = useCallback(async () => {
    await commit(layoutRef.current, "Failed to save dashboard layout:");
  }, [commit]);

  // Saved as the default layout (not deleted): the preferences endpoint has no list-level
  // DELETE, so a reset has to overwrite the stored row to survive a reload.
  const resetLayout = useCallback(async () => {
    await commit(defaultAdminLayout, "Failed to reset dashboard layout:");
  }, [commit]);

  const addWidget = useCallback(
    (widgetId: string) => {
      const prev = layoutRef.current;
      commit(
        {
          ...prev,
          widgets: [
            ...prev.widgets,
            (dashboardType === "admin" ? adminWidgetPlacement(widgetId) : undefined) ?? {
              id: widgetId,
              position: { x: 0, y: prev.widgets.length },
              size: { w: 1, h: 1 },
            },
          ],
        },
        "Failed to save widget addition:"
      );
    },
    [commit, dashboardType]
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
    saveStatus,
    retrySave,
    updateLayout,
    resetLayout,
    addWidget,
    removeWidget,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
};
