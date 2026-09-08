import { useMemo } from "react";
import { useCalendarWorkspace } from "@/context/CalendarWorkspaceContext";
import { useWorkspaceData } from "@/components/calendar/hooks/useWorkspaceData";

/**
 * Synchronously filter `selectedWorkspaceIds` (from localStorage) against
 * the available workspaces fetched from the API.
 *
 * This prevents stale workspace IDs from reaching API calls on the first
 * render after workspaces load. The reactive pruning in `useWorkspaceInit`
 * runs in a `useEffect` (after render), which is too late for React Query
 * hooks that fire during render via their `enabled` flag.
 *
 * Returns `[]` while workspaces are loading so no API calls fire with
 * potentially stale IDs. Once workspaces load, returns only the selected
 * IDs that exist in the available list.
 */
export const useValidWorkspaceIds = (): {
  validIds: number[];
  isLoading: boolean;
} => {
  const { selectedWorkspaceIds } = useCalendarWorkspace();
  const { data: workspaces, isLoading } = useWorkspaceData();

  const validIds = useMemo(() => {
    if (isLoading || !workspaces || workspaces.length === 0) return [];
    const availableIds = new Set(workspaces.map((w) => w.id));
    return selectedWorkspaceIds.filter((id) => availableIds.has(id));
  }, [selectedWorkspaceIds, workspaces, isLoading]);

  return { validIds, isLoading };
};
