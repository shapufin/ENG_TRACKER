import { useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { overtimeService } from "@/services/overtimeService";
import { userService } from "@/services/userService";
import { handleApiError } from "@/lib/error-handler";
import type { Client, UserProfile } from "@/types";

/** Draft per member: client id, null = None, undefined = multiple (replace on pick). */
type ClientDraft = number | null | undefined;

const draftFrom = (ids: number[] | undefined): ClientDraft =>
  !ids || ids.length === 0 ? null : ids.length === 1 ? ids[0] : undefined;

/**
 * Team-leader client assignment state (Settings → Client Assignment card).
 *
 * Members and active clients reuse the existing team/settings queries —
 * no new query keys. Saving writes dirty rows only through the TL-scoped
 * endpoint, then refreshes the team roster and the overtime form scope.
 * Self-service My Clients is untouched (last-write-wins).
 */
export const useClientAssignment = () => {
  const qc = useQueryClient();

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["team", "members"],
    queryFn: () => userService.getMyTeamMembers(),
  });
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["overtime", "available-clients"],
    queryFn: () => overtimeService.getAvailableClients(),
  });

  const initial = useMemo(() => {
    const map: Record<number, ClientDraft> = {};
    for (const m of members as UserProfile[]) {
      map[m.user.id] = draftFrom(m.clients);
    }
    return map;
  }, [members]);

  const [drafts, setDrafts] = useState<Record<number, ClientDraft>>({});
  const effective = useMemo(() => ({ ...initial, ...drafts }), [initial, drafts]);

  const setDraft = useCallback((userId: number, value: number | null) => {
    setDrafts((prev) => ({ ...prev, [userId]: value }));
  }, []);

  const isDirty = useMemo(
    () =>
      Object.keys(effective).some((key) => {
        const id = Number(key);
        const v = effective[id];
        return v !== undefined && v !== initial[id];
      }),
    [effective, initial]
  );

  const saveMutation = useMutation({
    mutationFn: async (rows: { userId: number; ids: number[] }[]) =>
      Promise.all(rows.map((r) => userService.assignMemberClients(r.userId, r.ids))),
    onSuccess: async () => {
      setDrafts({});
      await qc.invalidateQueries({ queryKey: ["team", "members"] });
      await qc.invalidateQueries({ queryKey: ["overtime", "clients"] });
    },
    onError: handleApiError,
  });

  const saveAll = useCallback(() => {
    const rows = Object.keys(effective)
      .map(Number)
      .filter((id) => {
        const v = effective[id];
        return v !== undefined && v !== initial[id];
      })
      .map((id) => {
        const v = effective[id];
        return { userId: id, ids: v === null || v === undefined ? [] : [v] };
      });
    saveMutation.mutate(rows);
  }, [effective, initial, saveMutation]);

  return {
    members: members as UserProfile[],
    clients: clients as Client[],
    effective,
    setDraft,
    saveAll,
    isSaving: saveMutation.isPending,
    isDirty,
    isLoading: membersLoading || clientsLoading,
  };
};
