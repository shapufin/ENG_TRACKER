import { describe, expect, it, vi, beforeEach } from "vitest";
import { useCreateSkill, useUpdateSkill } from "./useSkillsQueries";

const invalidateQueries = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn((options) => options),
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock("../services/skillsService", () => ({
  skillCategoryService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  skillService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  userSkillService: {},
  matrixService: {},
  gapReportService: {},
  historyService: {},
  skillExportService: {},
}));

beforeEach(() => invalidateQueries.mockClear());

type MutationConfiguration = { onSuccess?: () => void };

const configurationOf = (mutation: unknown) => mutation as MutationConfiguration;

describe("catalog mutation invalidation", () => {
  it("refreshes dependent matrix and gap data after creating a skill", () => {
    const mutation = configurationOf(useCreateSkill());

    mutation.onSuccess?.();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["skills", "skills"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["skills", "categories"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["skills", "matrix"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["skills", "coverage"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["skills", "gaps"] });
  });

  it("refreshes dependent data after updating a skill", () => {
    const updateMutation = configurationOf(useUpdateSkill());

    updateMutation.onSuccess?.();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["skills", "matrix"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["skills", "coverage"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["skills", "gaps"] });
  });
});
