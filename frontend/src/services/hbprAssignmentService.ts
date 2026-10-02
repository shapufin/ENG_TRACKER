import api from "@/lib/api";
import type {
  HbprAssignment,
  HbprAssignmentPayload,
  HbprReassignPayload,
} from "@/types/hbprAssignment";
import type { PaginatedResponse } from "@/types";

const BASE = "/users/hbpr-assignments";

export const hbprAssignmentService = {
  list: (params: { current?: "true" | "false"; search?: string } = {}) =>
    api.get<HbprAssignment[] | PaginatedResponse<HbprAssignment>>(`${BASE}/`, { params }),

  create: (data: HbprAssignmentPayload) => api.post<HbprAssignment>(`${BASE}/`, data),

  /** Close an assignment on a date, retaining it as history. */
  end: (id: number, effective_to: string) =>
    api.post<HbprAssignment>(`${BASE}/${id}/end/`, { effective_to }),

  /** Close the current assignment and create its replacement atomically. */
  reassign: (id: number, data: HbprReassignPayload) =>
    api.post<HbprAssignment>(`${BASE}/${id}/reassign/`, data),
};
