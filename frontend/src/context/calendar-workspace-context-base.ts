import { createContext } from "react";

export interface CalendarWorkspaceContextType {
  selectedWorkspaceId: number | null;
  selectedWorkspaceIds: number[];
  setSelectedWorkspace: (id: number | null) => void;
  setSelectedWorkspaces: (ids: number[]) => void;
  toggleWorkspace: (id: number) => void;
  isMultiSelect: boolean;
  setIsMultiSelect: (multi: boolean) => void;
}

export const CalendarWorkspaceContext = createContext<CalendarWorkspaceContextType | undefined>(
  undefined
);
