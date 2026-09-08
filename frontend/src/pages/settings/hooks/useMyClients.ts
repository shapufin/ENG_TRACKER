import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { overtimeService } from "@/services/overtimeService";
import { userService } from "@/services/userService";
import { handleApiError } from "@/lib/error-handler";
import type { Client } from "@/types";

interface UseMyClientsArgs {
  /** Currently assigned client IDs from the auth user. */
  assignedClientIds: number[];
  /** Refresh the auth context user after a successful save. */
  onAssignedChange: () => Promise<unknown>;
}

/**
 * Loads all active clients (for the picker) and tracks the user's selected
 * set. Saving calls the self-assign endpoint, then refreshes auth state and
 * invalidates the scoped `["overtime", "clients"]` query so every form that
 * sources clients from `getClients()` re-fetches with the new assignment.
 *
 * Local `selected` state is initialized from `assignedClientIds` and reset on
 * a successful save (the only path that changes the assignment in this UI);
 * no effect-based prop sync to avoid cascading renders.
 */
export const useMyClients = ({ assignedClientIds, onAssignedChange }: UseMyClientsArgs) => {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number[]>(assignedClientIds);

  const { data: available = [], isLoading } = useQuery({
    queryKey: ["overtime", "available-clients"],
    queryFn: () => overtimeService.getAvailableClients(),
  });

  const assignMutation = useMutation({
    mutationFn: (ids: number[]) => userService.assignClients(ids),
    onSuccess: async (_data, savedIds) => {
      setSelected(savedIds);
      await onAssignedChange();
      // Forms read from the scoped getClients() — invalidate so they re-fetch.
      await qc.invalidateQueries({ queryKey: ["overtime", "clients"] });
    },
    onError: handleApiError,
  });

  const toggle = useCallback((id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }, []);

  const save = useCallback(() => {
    assignMutation.mutate(selected);
  }, [assignMutation, selected]);

  const isDirty =
    selected.length !== assignedClientIds.length ||
    selected.some((id) => !assignedClientIds.includes(id));

  return {
    available: available as Client[],
    selected,
    toggle,
    save,
    isSaving: assignMutation.isPending,
    isDirty,
    isLoading,
  };
};
