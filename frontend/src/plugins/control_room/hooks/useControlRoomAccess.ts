/**
 * useControlRoomAccess — admin hook for managing Control Room access & scopes.
 *
 * Uses React Query for reads and mutations with cache invalidation.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { extractApiErrorMessage } from "@/lib/apiFormError";
import { controlRoomService } from "../services/controlRoomService";

const ACCESS_KEY = ["control-room", "access"] as const;
const ME_KEY = ["control-room", "me"] as const;

/** Shared invalidation helper: invalidates all CR-mutation-relevant caches. */
const invalidateCRMutationQueries = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ACCESS_KEY });
  void qc.invalidateQueries({ queryKey: ME_KEY });
  void qc.invalidateQueries({ queryKey: ["admin", "profiles"] });
};

export const useControlRoomAccessList = () => {
  return useQuery({
    queryKey: ACCESS_KEY,
    queryFn: () => controlRoomService.getAccessList(),
    staleTime: 30_000,
  });
};

export const useControlRoomMe = () => {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => controlRoomService.getMe(),
    staleTime: 60_000,
  });
};

export const useCreateControlRoomAccess = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof controlRoomService.createAccess>[0]) =>
      controlRoomService.createAccess(payload),
    onSuccess: () => invalidateCRMutationQueries(qc),
  });
};

/**
 * One-step "Create CR User" mutation: creates a normal Django user + grants
 * Control Room access with team scopes atomically. Invalidates the access
 * list on success.
 */
export const useCreateCRUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof controlRoomService.createCRUser>[0]) =>
      controlRoomService.createCRUser(payload),
    onSuccess: () => invalidateCRMutationQueries(qc),
  });
};

/**
 * Update a CR user's basic info + team scopes. Invalidates access list +
 * users queries on success.
 */
export const useUpdateCRUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof controlRoomService.updateCRUser>[0]) =>
      controlRoomService.updateCRUser(payload),
    onSuccess: () => invalidateCRMutationQueries(qc),
  });
};

/**
 * Bulk update CR access (team scopes replace + is_active) for multiple
 * users. Invalidates access + users + admin queries on success.
 */
export const useBulkUpdateCRUsers = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof controlRoomService.bulkUpdateCRUsers>[0]) =>
      controlRoomService.bulkUpdateCRUsers(payload),
    onSuccess: () => invalidateCRMutationQueries(qc),
  });
};

export const useUpdateControlRoomAccess = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: Parameters<typeof controlRoomService.updateAccess>[1];
    }) => controlRoomService.updateAccess(id, payload),
    onSuccess: () => invalidateCRMutationQueries(qc),
    onError: (error: unknown) =>
      toast.error(extractApiErrorMessage(error, "Failed to update Control Room access.")),
  });
};

export const useDeleteControlRoomAccess = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => controlRoomService.deleteAccess(id),
    onSuccess: () => invalidateCRMutationQueries(qc),
    onError: (error: unknown) =>
      toast.error(extractApiErrorMessage(error, "Failed to revoke Control Room access.")),
  });
};
