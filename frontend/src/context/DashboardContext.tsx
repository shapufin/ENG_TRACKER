import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { dashboardService } from "@/services/dashboardService";
import {
  adminWidgetPlacement,
  defaultAdminLayout,
  type StoredDashboardLayout,
} from "@/components/dashboard/widgetRegistry";
import {
  isStoredLayout,
  migrateLayout,
  pruneLayouts,
} from "@/pages/admin/components/dashboard-grid/gridLayout";

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
  /** Resolves true when the default layout was saved, false when the save failed. */
  resetLayout: () => Promise<boolean>;
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

/** The layout a dashboard type starts with and resets to. Only the admin one has widgets today. */
const defaultLayoutFor = (dashboardType: string): DashboardLayout =>
  dashboardType === "admin" ? defaultAdminLayout : { columns: 12, widgets: [] };

interface DashboardProviderProps {
  dashboardType: string;
  children: React.ReactNode;
}

export const DashboardProvider: React.FC<DashboardProviderProps> = ({
  dashboardType,
  children,
}) => {
  const [layout, setLayout] = useState<DashboardLayout>(() => defaultLayoutFor(dashboardType));
  const [isLoading, setIsLoading] = useState(true);
  // Latest layout, readable synchronously so back-to-back toggles build on each
  // other instead of on a stale render, and saves queue up (each save is a
  // GET + PUT, so overlapping ones would race and drop the last toggles).
  const layoutRef = useRef<DashboardLayout>(layout);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  // Saves run in commit order, so the newest commit finishes last and decides the status:
  // an earlier failure is superseded by a later success, and the other way round.
  const commitSeq = useRef(0);
  // Edits before the saved layout has arrived would be overwritten by it (or overwrite it).
  const loaded = useRef(false);
  const commit = useCallback(
    (next: DashboardLayout, failure: string): Promise<boolean> => {
      if (!loaded.current) return Promise.resolve(false);
      layoutRef.current = next;
      setLayout(next);
      const seq = (commitSeq.current += 1);
      setSaveStatus("saving");
      const saved = saveQueue.current
        .then(() => dashboardService.saveDashboardLayout(next, dashboardType))
        .then(() => true)
        .catch((error) => {
          console.error(failure, error);
          return false;
        })
        .then((ok) => {
          if (seq === commitSeq.current) setSaveStatus(ok ? "saved" : "error");
          return ok;
        });
      saveQueue.current = saved;
      return saved;
    },
    [dashboardType]
  );

  // Load layout from backend on mount
  useEffect(() => {
    loaded.current = false;
    const loadLayout = async () => {
      try {
        const savedLayout = await dashboardService.getDashboardLayout(dashboardType);
        // The preferences endpoint is paginated: the saved row is results[0].
        const saved = savedLayout?.results?.[0]?.layout ?? savedLayout?.layout;
        // `{}` or a layout without a widgets list is "nothing saved": keep the default.
        if (isStoredLayout(saved)) {
          // Only the admin dashboard moved to the merged 12-column widgets; the others
          // keep whatever they stored.
          const restored = dashboardType === "admin" ? migrateLayout(saved) : saved;
          layoutRef.current = restored;
          setLayout(restored);
        }
      } catch (error) {
        console.error("Failed to load dashboard layout:", error);
        // Use default layout on error
      } finally {
        loaded.current = true;
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
  const resetLayout = useCallback(
    () => commit(defaultLayoutFor(dashboardType), "Failed to reset dashboard layout:"),
    [commit, dashboardType]
  );

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
        pruneLayouts({ ...prev, widgets: prev.widgets.filter((w) => w.id !== widgetId) }),
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
