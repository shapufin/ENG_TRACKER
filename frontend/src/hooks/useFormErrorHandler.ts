import { handleApiError } from "@/lib/error-handler";
import type { ApiError } from "@/types";

/**
 * Reusable error handler for form submissions.
 * Extracts validation errors from API responses and formats them for form display.
 *
 * Extracted from duplicated code in:
 * - ClientsPage (2 instances)
 * - LeaveBalancesPage
 * - TeamsPage (2 instances)
 * - UsersPage
 */
export const useFormErrorHandler = (setFormErrors: (errors: Record<string, string>) => void) => {
  return (err: ApiError) => {
    handleApiError(err);
    const data = err?.response?.data;
    if (data && typeof data === "object") {
      const errors: Record<string, string> = {};
      Object.entries(data).forEach(([key, val]) => {
        errors[key] = Array.isArray(val) ? val.join(" ") : String(val);
      });
      setFormErrors(errors);
    }
  };
};
