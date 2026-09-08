/** React Query hooks for the Skills plugin. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  skillCategoryService,
  skillService,
  userSkillService,
  matrixService,
  gapReportService,
  historyService,
  skillExportService,
} from "../services/skillsService";
import { userService } from "@/services/userService";
import type { SkillMatrixFilters, SkillListFilters, UserSkillFilters } from "../types/skills";

const CATALOG_QUERY_KEYS = [
  ["skills", "skills"],
  ["skills", "categories"],
  ["skills", "matrix"],
  ["skills", "coverage"],
  ["skills", "gaps"],
] as const;

const invalidateCatalogQueries = (queryClient: ReturnType<typeof useQueryClient>) => {
  CATALOG_QUERY_KEYS.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
};

// ============================================================================
// CATEGORIES
// ============================================================================

export const useSkillCategories = (activeOnly?: boolean) =>
  useQuery({
    queryKey: ["skills", "categories", { activeOnly }],
    queryFn: () => skillCategoryService.list(activeOnly),
  });

export const useCreateSkillCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: skillCategoryService.create,
    onSuccess: () => invalidateCatalogQueries(qc),
  });
};

export const useUpdateSkillCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      skillCategoryService.update(id, data),
    onSuccess: () => invalidateCatalogQueries(qc),
  });
};

export const useDeleteSkillCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: skillCategoryService.delete,
    onSuccess: () => invalidateCatalogQueries(qc),
  });
};

// ============================================================================
// SKILLS
// ============================================================================

export const useSkills = (filters?: SkillListFilters) =>
  useQuery({
    queryKey: ["skills", "skills", filters],
    queryFn: () => skillService.list(filters),
  });

export const useCreateSkill = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: skillService.create,
    onSuccess: () => invalidateCatalogQueries(qc),
  });
};

export const useUpdateSkill = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      skillService.update(id, data),
    onSuccess: () => invalidateCatalogQueries(qc),
  });
};

// ============================================================================
// USER SKILLS
// ============================================================================

export const useUserSkills = (filters?: UserSkillFilters) =>
  useQuery({
    queryKey: ["skills", "user-skills", filters],
    queryFn: () => userSkillService.list(filters),
  });

export const useCreateUserSkill = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: userSkillService.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills", "user-skills"] });
      qc.invalidateQueries({ queryKey: ["skills", "matrix"] });
      qc.invalidateQueries({ queryKey: ["skills", "coverage"] });
      qc.invalidateQueries({ queryKey: ["skills", "gaps"] });
      qc.invalidateQueries({ queryKey: ["skills", "history"] });
    },
  });
};

export const useUpdateUserSkill = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { level?: number; notes?: string } }) =>
      userSkillService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills", "user-skills"] });
      qc.invalidateQueries({ queryKey: ["skills", "matrix"] });
      qc.invalidateQueries({ queryKey: ["skills", "coverage"] });
      qc.invalidateQueries({ queryKey: ["skills", "gaps"] });
      qc.invalidateQueries({ queryKey: ["skills", "history"] });
    },
  });
};

export const useRateUserSkill = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { level: number; notes?: string } }) =>
      userSkillService.rate(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills", "user-skills"] });
      qc.invalidateQueries({ queryKey: ["skills", "matrix"] });
      qc.invalidateQueries({ queryKey: ["skills", "coverage"] });
      qc.invalidateQueries({ queryKey: ["skills", "gaps"] });
      qc.invalidateQueries({ queryKey: ["skills", "history"] });
    },
  });
};

export const useDeleteUserSkill = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: userSkillService.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills", "user-skills"] });
      qc.invalidateQueries({ queryKey: ["skills", "matrix"] });
      qc.invalidateQueries({ queryKey: ["skills", "coverage"] });
      qc.invalidateQueries({ queryKey: ["skills", "gaps"] });
      qc.invalidateQueries({ queryKey: ["skills", "history"] });
    },
  });
};

// ============================================================================
// MATRIX
// ============================================================================

export const useMatrix = (filters?: SkillMatrixFilters) =>
  useQuery({
    queryKey: ["skills", "matrix", filters],
    queryFn: () => matrixService.matrix(filters),
  });

export const useCoverage = (category?: string) =>
  useQuery({
    queryKey: ["skills", "coverage", { category }],
    queryFn: () => matrixService.coverage(category),
  });

// ============================================================================
// GAP REPORT
// ============================================================================

export const useGapReport = (category?: string, threshold?: number, topN?: number) =>
  useQuery({
    queryKey: ["skills", "gaps", { category, threshold, topN }],
    queryFn: () => gapReportService.gaps(category, threshold, topN),
  });

// ============================================================================
// EXPORT
// ============================================================================

export const useExportMatrix = () =>
  useMutation({
    mutationFn: ({ category, search }: { category?: string; search?: string }) =>
      skillExportService.export(category, search),
  });

// ============================================================================
// HISTORY
// ============================================================================

export const useHistory = (
  userId?: number,
  skillId?: number,
  page?: number,
  dateFrom?: string,
  dateTo?: string
) =>
  useQuery({
    queryKey: ["skills", "history", { userId, skillId, page, dateFrom, dateTo }],
    queryFn: () => historyService.list(userId, skillId, page, dateFrom, dateTo),
    staleTime: 15_000,
  });

/**
 * Search users by username/email for the history page filter.
 * Uses the core /users/users/ endpoint (admin/HR scope). Returns
 * undefined data when the query is disabled or the user lacks permission.
 */
export const useUsersSearch = (query: string, enabled: boolean) =>
  useQuery({
    queryKey: ["users", "search", query],
    queryFn: () => userService.getUsers({ search: query, page_size: 20 }),
    enabled: enabled && query.length >= 2,
    staleTime: 15_000,
  });
