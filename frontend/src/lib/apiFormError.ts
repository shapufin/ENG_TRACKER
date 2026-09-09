type ApiErrorData = {
  error?: string;
  detail?: string;
  message?: string;
  non_field_errors?: string[];
  [key: string]: unknown;
};

type ApiError = {
  response?: {
    data?: ApiErrorData | ApiErrorData[] | string;
  };
  message?: string;
};

/**
 * Extract a human-readable message from a DRF/axios error.
 *
 * DRF serializes different error shapes differently:
 * - ``{"detail": "..."}`` for permission/throttling errors.
 * - ``{"error": "..."}`` for legacy custom responses.
 * - ``{"non_field_errors": ["..."]}`` for serializer-level ValidationErrors.
 * - ``{"field": ["..."]}`` for field-level ValidationErrors (e.g. unique
 *   constraints on Group.name / Group.code).
 * - A bare string or array for non-dict payloads.
 *
 * Field-level errors are flattened to ``"field: message"`` so the dialog
 * shows the real reason (e.g. "code: group with this code already exists")
 * instead of a generic fallback.
 */
export function extractApiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as ApiError)?.response?.data;
  if (typeof data === "string" && data.trim()) return data;
  if (Array.isArray(data)) {
    const joined = data.filter(Boolean).join(", ");
    if (joined) return joined;
  }
  const obj = data as ApiErrorData | undefined;
  if (obj && typeof obj === "object") {
    if (obj.error) return String(obj.error);
    if (obj.detail) return String(obj.detail);
    if (obj.message) return String(obj.message);
    if (Array.isArray(obj.non_field_errors) && obj.non_field_errors.length) {
      return obj.non_field_errors.join(", ");
    }
    const fieldErrors = Object.entries(obj)
      .filter(([k]) => !["error", "detail", "message", "non_field_errors"].includes(k))
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
    if (fieldErrors.length) return fieldErrors.join("; ");
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
