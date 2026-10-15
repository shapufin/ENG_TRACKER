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
export const extractFieldErrors = (err: ApiError): Record<string, string> => {
  const data = err?.response?.data;
  const errors: Record<string, string> = {};
  if (data && typeof data === "object") {
    Object.entries(data).forEach(([key, val]) => {
      errors[key] = Array.isArray(val) ? val.join(" ") : String(val);
    });
  }
  return errors;
};

export const useFormErrorHandler = (setFormErrors: (errors: Record<string, string>) => void) => {
  return (err: ApiError) => {
    handleApiError(err);
    const data = err?.response?.data;
    if (data && typeof data === "object") setFormErrors(extractFieldErrors(err));
  };
};
