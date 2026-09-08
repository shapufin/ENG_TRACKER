import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleApiError } from "@/lib/error-handler";

export interface UseAdminRejectMutationOptions {
  onSuccess?: () => void;
  invalidateKeys?: string[][];
}

/**
 * Shared hook for admin rejection mutations.
 * Handles rejection with query invalidation.
 *
 * @param rejectFn - Function to call for rejection
 * @param options - Configuration options
 * @returns Mutation object
 *
 * @example
 * const mutation = useAdminRejectMutation(leaveService.reject, {
 *   invalidateKeys: [["vacations", "calendar"]],
 * });
 */
export const useAdminRejectMutation = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rejectFn: (id: number, reason: string) => Promise<any>,
  options?: UseAdminRejectMutationOptions
) => {
  const queryClient = useQueryClient();
  const defaultInvalidateKeys = [
    ["vacations", "calendar"],
    ["admin", "logs"],
  ];

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => rejectFn(id, reason),
    onSuccess: () => {
      const keysToInvalidate = options?.invalidateKeys ?? defaultInvalidateKeys;
      keysToInvalidate.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      toast.success("Rejected");
      options?.onSuccess?.();
    },
    onError: (err: unknown) => handleApiError(err),
  });
};
