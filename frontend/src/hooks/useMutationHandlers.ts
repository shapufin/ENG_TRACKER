import { toast } from "sonner";
import { handleApiError } from "@/lib/error-handler";
import { OfflineQueuedError } from "@/lib/offline/offlineQueue";

export interface MutationHandlerOptions {
  onSuccess?: () => void | Promise<void>;
  onError?: (err: unknown) => void;
  successMessage?: string;
}

type RefreshFn = () => void | Promise<void>;

/**
 * Creates standard mutation handlers for CRUD operations.
 * Reduces boilerplate across mutation definitions.
 *
 * @param refreshFn - Function to call to refresh data after mutation
 * @param successMessage - Message to display on success
 * @param options - Additional callback options
 * @returns Object with onSuccess and onError handlers
 */
export const createMutationHandlers = (
  refreshFn: RefreshFn,
  successMessage: string = "Operation successful",
  options?: MutationHandlerOptions
) => ({
  onSuccess: async () => {
    await refreshFn();
    toast.success(successMessage);
    await options?.onSuccess?.();
  },
  onError: (err: unknown) => {
    if (err instanceof OfflineQueuedError) {
      toast.info(err.message);
    } else {
      handleApiError(err);
    }
    options?.onError?.(err);
  },
});

/**
 * Creates handlers for approval mutations.
 * Includes standard success/error handling.
 */
export const createApprovalHandlers = (refreshFn: RefreshFn, options?: MutationHandlerOptions) =>
  createMutationHandlers(refreshFn, "Approved", options);

/**
 * Creates handlers for rejection mutations.
 * Includes standard success/error handling.
 */
export const createRejectionHandlers = (refreshFn: RefreshFn, options?: MutationHandlerOptions) =>
  createMutationHandlers(refreshFn, "Rejected", options);

/**
 * Creates handlers for create mutations.
 */
export const createCreateHandlers = (
  refreshFn: RefreshFn,
  resourceName: string = "Request",
  options?: MutationHandlerOptions
) => createMutationHandlers(refreshFn, `${resourceName} created`, options);

/**
 * Creates handlers for update mutations.
 */
export const createUpdateHandlers = (
  refreshFn: RefreshFn,
  resourceName: string = "Request",
  options?: MutationHandlerOptions
) => createMutationHandlers(refreshFn, `${resourceName} updated`, options);

/**
 * Creates handlers for delete mutations.
 */
export const createDeleteHandlers = (
  refreshFn: RefreshFn,
  resourceName: string = "Request",
  options?: MutationHandlerOptions
) => createMutationHandlers(refreshFn, `${resourceName} deleted`, options);
