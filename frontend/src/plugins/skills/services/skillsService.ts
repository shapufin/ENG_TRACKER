/** API service for the Skills plugin. */
import api from "@/lib/api";
import { normalizeList } from "@/lib/api-utils";
import type { PaginatedResponse } from "@/types";
import type {
  SkillCategory,
  Skill,
  UserSkill,
  SkillRatingHistory,
  TeamMatrixRow,
  SkillCoverage,
  SkillMatrixFilters,
  SkillListFilters,
  UserSkillFilters,
} from "../types/skills";

const BASE = "/plugins/skills";

const addDefinedParam = (
  query: Record<string, string>,
  key: string,
  value: string | number | boolean | undefined
) => {
  if (value !== undefined && value !== "" && value !== null) query[key] = String(value);
};

// ============================================================================
// CATEGORIES
// ============================================================================

export const skillCategoryService = {
  list: async (activeOnly?: boolean): Promise<SkillCategory[]> => {
    const params: Record<string, string> = {};
    if (activeOnly) addDefinedParam(params, "active", "true");
    const resp = await api.get(`${BASE}/categories/`, { params });
    return normalizeList<SkillCategory>(resp.data);
  },
  get: async (id: number): Promise<SkillCategory> => {
    const resp = await api.get(`${BASE}/categories/${id}/`);
    return resp.data;
  },
  create: async (data: Partial<SkillCategory>): Promise<SkillCategory> => {
    const resp = await api.post(`${BASE}/categories/`, data);
    return resp.data;
  },
  update: async (id: number, data: Partial<SkillCategory>): Promise<SkillCategory> => {
    const resp = await api.patch(`${BASE}/categories/${id}/`, data);
    return resp.data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/categories/${id}/`);
  },
};

// ============================================================================
// SKILLS
// ============================================================================

export const skillService = {
  list: async (filters?: SkillListFilters): Promise<Skill[]> => {
    const params: Record<string, string> = {};
    if (filters) {
      addDefinedParam(params, "category", filters.category);
      addDefinedParam(params, "search", filters.search);
      if (filters.active !== undefined) addDefinedParam(params, "active", filters.active);
    }
    const resp = await api.get(`${BASE}/skills/`, { params });
    return normalizeList<Skill>(resp.data);
  },
  get: async (id: number): Promise<Skill> => {
    const resp = await api.get(`${BASE}/skills/${id}/`);
    return resp.data;
  },
  create: async (data: Partial<Skill>): Promise<Skill> => {
    const resp = await api.post(`${BASE}/skills/`, data);
    return resp.data;
  },
  update: async (id: number, data: Partial<Skill>): Promise<Skill> => {
    const resp = await api.patch(`${BASE}/skills/${id}/`, data);
    return resp.data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/skills/${id}/`);
  },
};

// ============================================================================
// USER SKILLS
// ============================================================================

export const userSkillService = {
  list: async (filters?: UserSkillFilters): Promise<PaginatedResponse<UserSkill>> => {
    const params: Record<string, string> = {};
    if (filters) {
      addDefinedParam(params, "skill_id", filters.skill_id);
      addDefinedParam(params, "category", filters.category);
      addDefinedParam(params, "min_level", filters.min_level);
      addDefinedParam(params, "max_level", filters.max_level);
    }
    const resp = await api.get(`${BASE}/user-skills/`, { params });
    return resp.data;
  },
  create: async (data: {
    user?: number;
    skill: number;
    level: number;
    notes?: string;
  }): Promise<UserSkill> => {
    const resp = await api.post(`${BASE}/user-skills/`, data);
    return resp.data;
  },
  update: async (id: number, data: { level?: number; notes?: string }): Promise<UserSkill> => {
    const resp = await api.patch(`${BASE}/user-skills/${id}/`, data);
    return resp.data;
  },
  rate: async (id: number, data: { level: number; notes?: string }): Promise<UserSkill> => {
    const resp = await api.post(`${BASE}/user-skills/${id}/rate/`, data);
    return resp.data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/user-skills/${id}/`);
  },
};

// ============================================================================
// MATRIX
// ============================================================================

export const matrixService = {
  matrix: async (filters?: SkillMatrixFilters): Promise<PaginatedResponse<TeamMatrixRow>> => {
    const params: Record<string, string> = {};
    if (filters) {
      addDefinedParam(params, "category", filters.category);
      if (filters.skill_id?.length) {
        params.skill_id = filters.skill_id.join(",");
      }
      addDefinedParam(params, "min_level", filters.min_level);
      addDefinedParam(params, "max_level", filters.max_level);
      addDefinedParam(params, "search", filters.search);
      addDefinedParam(params, "page", filters.page);
      addDefinedParam(params, "page_size", filters.page_size);
    }
    const resp = await api.get(`${BASE}/matrix/matrix/`, { params });
    return resp.data;
  },
  coverage: async (category?: string): Promise<SkillCoverage[]> => {
    const params: Record<string, string> = {};
    addDefinedParam(params, "category", category);
    const resp = await api.get(`${BASE}/matrix/coverage/`, { params });
    return normalizeList<SkillCoverage>(resp.data);
  },
};

// ============================================================================
// GAP REPORT
// ============================================================================

export const gapReportService = {
  gaps: async (category?: string, threshold?: number, topN?: number): Promise<SkillCoverage[]> => {
    const params: Record<string, string> = {};
    addDefinedParam(params, "category", category);
    addDefinedParam(params, "threshold", threshold);
    addDefinedParam(params, "top_n", topN);
    const resp = await api.get(`${BASE}/gap-report/gaps/`, { params });
    return normalizeList<SkillCoverage>(resp.data);
  },
};

// ============================================================================
// EXPORT
// ============================================================================

export const skillExportService = {
  export: async (category?: string, search?: string): Promise<Blob> => {
    const params: Record<string, string> = {};
    addDefinedParam(params, "category", category);
    addDefinedParam(params, "search", search);
    const resp = await api.get(`${BASE}/export/export/`, {
      params,
      responseType: "blob",
    });
    return resp.data;
  },
};

// ============================================================================
// HISTORY
// ============================================================================

export const historyService = {
  list: async (
    userId?: number,
    skillId?: number,
    page?: number,
    dateFrom?: string,
    dateTo?: string
  ): Promise<PaginatedResponse<SkillRatingHistory>> => {
    const params: Record<string, string> = {};
    addDefinedParam(params, "user_id", userId);
    addDefinedParam(params, "skill_id", skillId);
    addDefinedParam(params, "page", page);
    addDefinedParam(params, "date_from", dateFrom);
    addDefinedParam(params, "date_to", dateTo);
    const resp = await api.get(`${BASE}/history/`, { params });
    return resp.data;
  },
};
