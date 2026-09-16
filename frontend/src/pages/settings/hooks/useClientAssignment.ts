import { useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { overtimeService } from "@/services/overtimeService";
import { userService } from "@/services/userService";
import { handleApiError } from "@/lib/error-handler";
import type { Client, UserProfile } from "@/types";

const sameIds = (a: number[], b: number[]): boolean =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/**
 * Team-leader client assignment state (Settings → Client Assignment card).
 *
 * Members and active clients reuse the existing team/settings queries —
 * no new query keys. Saving writes dirty rows only through the TL-scoped
 * endpoint, then refreshes the team roster and the overtime form scope.
 * Each member's client set is multi-select (mirrors the self-service My
 * Clients picker) so a user with several clients shows all of them checked,
 * not a "multiple" placeholder.
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
    const map: Record<number, number[]> = {};
    for (const m of members as UserProfile[]) {
      map[m.user.id] = m.clients ?? [];
    }
    return map;
  }, [members]);

  const [drafts, setDrafts] = useState<Record<number, number[]>>({});
  const effective = useMemo(() => ({ ...initial, ...drafts }), [initial, drafts]);

  const setDraft = useCallback((userId: number, ids: number[]) => {
    setDrafts((prev) => ({ ...prev, [userId]: ids }));
  }, []);

  const isDirty = useMemo(
    () => Object.keys(drafts).some((key) => !sameIds(drafts[Number(key)], initial[Number(key)] ?? [])),
    [drafts, initial]
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
    const rows = Object.keys(drafts)
      .map(Number)
      .filter((id) => !sameIds(drafts[id], initial[id] ?? []))
      .map((id) => ({ userId: id, ids: drafts[id] }));
    saveMutation.mutate(rows);
  }, [drafts, initial, saveMutation]);

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
