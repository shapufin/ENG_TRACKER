import { describe, expect, it, vi, beforeEach } from "vitest";
import { useQuery } from "@tanstack/react-query";
import { useCreateSkill, useUpdateSkill, useLevelLabel } from "./useSkillsQueries";

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
  skillLevelLabelsService: { get: vi.fn(), update: vi.fn() },
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

describe("useLevelLabel", () => {
  it("returns the custom label when loaded", () => {
    vi.mocked(useQuery).mockReturnValue({ data: { level_3_label: "Rockstar" } } as never);
    expect(useLevelLabel(3)).toBe("Rockstar");
  });

  it("falls back to the hardcoded default while the fetch is pending", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    expect(useLevelLabel(3)).toBe("Proficient");
  });

  it("falls back to the hardcoded default when the custom label is blank", () => {
    vi.mocked(useQuery).mockReturnValue({ data: { level_3_label: "" } } as never);
    expect(useLevelLabel(3)).toBe("Proficient");
  });

  it("falls back to L{n} for an out-of-range level with no custom data", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);
    expect(useLevelLabel(9)).toBe("L9");
  });
});
