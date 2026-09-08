import React, { useState, useEffect } from "react";
import type { ReactNode } from "react";
import {
  CalendarWorkspaceContext,
  type CalendarWorkspaceContextType,
} from "./calendar-workspace-context-base";

const STORAGE_KEY = "calendar_workspace_ids";
const STORAGE_MULTI_KEY = "calendar_workspace_multi";

interface CalendarWorkspaceProviderProps {
  children: ReactNode;
}

const getStoredIds = (): number[] => {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const getStoredMulti = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const stored = localStorage.getItem(STORAGE_MULTI_KEY);
    return stored ? JSON.parse(stored) : false;
  } catch {
    return false;
  }
};

export const CalendarWorkspaceProvider: React.FC<CalendarWorkspaceProviderProps> = ({
  children,
}) => {
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<number[]>(getStoredIds);
  const [isMultiSelect, setIsMultiSelect] = useState<boolean>(getStoredMulti);

  const selectedWorkspaceId = selectedWorkspaceIds.length > 0 ? selectedWorkspaceIds[0] : null;

  // Persist workspace selection to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedWorkspaceIds));
  }, [selectedWorkspaceIds]);

  // Persist multi-select mode to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_MULTI_KEY, JSON.stringify(isMultiSelect));
  }, [isMultiSelect]);

  const setSelectedWorkspace = (id: number | null) => {
    setSelectedWorkspaceIds(id ? [id] : []);
  };

  const setSelectedWorkspaces = (ids: number[]) => {
    setSelectedWorkspaceIds(ids);
  };

  const toggleWorkspace = (id: number) => {
    if (isMultiSelect) {
      setSelectedWorkspaceIds((prev) => {
        if (prev.includes(id)) {
          return prev.filter((wid) => wid !== id);
        }
        return [...prev, id];
      });
    } else {
      setSelectedWorkspace(id);
    }
  };

  const value: CalendarWorkspaceContextType = {
    selectedWorkspaceId,
    selectedWorkspaceIds,
    setSelectedWorkspace,
    setSelectedWorkspaces,
    toggleWorkspace,
    isMultiSelect,
    setIsMultiSelect,
  };

  return (
    <CalendarWorkspaceContext.Provider value={value}>{children}</CalendarWorkspaceContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export { useCalendarWorkspace } from "@/hooks/useCalendarWorkspace";
