import { useEffect, useRef } from "react";
import type { CalendarWorkspace } from "@/types";

interface UseWorkspaceInitParams {
  isLoading: boolean;
  workspaces: CalendarWorkspace[];
  selectedWorkspaceIds: number[];
  setSelectedWorkspaces: (ids: number[]) => void;
  userTeamId?: number | null;
  isPrivileged: boolean;
  isMultiSelect: boolean;
}

export const useWorkspaceInit = ({
  isLoading,
  workspaces,
  selectedWorkspaceIds,
  setSelectedWorkspaces,
  userTeamId,
  isPrivileged,
  isMultiSelect,
}: UseWorkspaceInitParams) => {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current || isLoading) return;
    initializedRef.current = true;
    if (workspaces.length === 0) return;

    // Prune stale IDs: a user's localStorage may contain workspace IDs that
    // are no longer accessible (e.g. after a calendar visibility change).
    // Filter selected IDs down to only those still in the available list.
    const availableIds = new Set(workspaces.map((w) => w.id));
    const validIds = selectedWorkspaceIds.filter((id) => availableIds.has(id));

    if (validIds.length !== selectedWorkspaceIds.length) {
      // Some selected IDs are stale — prune them.
      if (validIds.length > 0) {
        // Respect single-select constraint: keep only the first valid ID.
        setSelectedWorkspaces(isMultiSelect ? validIds : [validIds[0]]);
        return;
      }
      // All selected IDs are stale — fall through to auto-select below.
    } else if (selectedWorkspaceIds.length > 0) {
      // No stale IDs; existing selection is valid.
      // If multi-select is disabled, reset any stale multi-selection to a single workspace.
      if (!isMultiSelect && selectedWorkspaceIds.length > 1) {
        setSelectedWorkspaces([selectedWorkspaceIds[0]]);
        return;
      }
      return;
    }

    const userTeamWorkspace = userTeamId ? workspaces.find((w) => w.team === userTeamId) : null;
    if (userTeamWorkspace) {
      setSelectedWorkspaces([userTeamWorkspace.id]);
    } else if (!isPrivileged) {
      // Employee with no team workspace: don't auto-select
    } else {
      setSelectedWorkspaces([workspaces[0].id]);
    }
  }, [
    isLoading,
    workspaces,
    selectedWorkspaceIds,
    setSelectedWorkspaces,
    userTeamId,
    isPrivileged,
    isMultiSelect,
  ]);
};
