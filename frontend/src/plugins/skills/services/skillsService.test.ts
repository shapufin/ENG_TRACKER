import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import {
  skillCategoryService,
  skillService,
  userSkillService,
  matrixService,
  gapReportService,
  skillExportService,
  historyService,
} from "./skillsService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

const BASE = "/plugins/skills";

beforeEach(() => vi.clearAllMocks());

describe("skillsService URL contracts", () => {
  it("skillCategoryService.list calls /plugins/skills/categories/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await skillCategoryService.list();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/categories/`, { params: {} });
  });

  it("skillCategoryService.list serializes the active-only filter", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await skillCategoryService.list(true);
    expect(api.get).toHaveBeenCalledWith(`${BASE}/categories/`, {
      params: { active: "true" },
    });
  });

  it("skillCategoryService.get calls /plugins/skills/categories/:id/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await skillCategoryService.get(1);
    expect(api.get).toHaveBeenCalledWith(`${BASE}/categories/1/`);
  });

  it("skillCategoryService.create POSTs to /plugins/skills/categories/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await skillCategoryService.create({ name: "X" });
    expect(api.post).toHaveBeenCalledWith(`${BASE}/categories/`, { name: "X" });
  });

  it("skillCategoryService.update PATCHes /plugins/skills/categories/:id/", async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: {} } as any);
    await skillCategoryService.update(2, { name: "Y" });
    expect(api.patch).toHaveBeenCalledWith(`${BASE}/categories/2/`, { name: "Y" });
  });

  it("skillCategoryService.delete DELETEs /plugins/skills/categories/:id/", async () => {
    vi.mocked(api.delete).mockResolvedValue({} as any);
    await skillCategoryService.delete(3);
    expect(api.delete).toHaveBeenCalledWith(`${BASE}/categories/3/`);
  });

  it("skillService.list calls /plugins/skills/skills/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await skillService.list();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/skills/`, { params: {} });
  });

  it("skillService.list serializes category, search, and active filters", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await skillService.list({ category: "backend", search: "python", active: true });
    expect(api.get).toHaveBeenCalledWith(`${BASE}/skills/`, {
      params: { category: "backend", search: "python", active: "true" },
    });
  });

  it("skillService.list serializes an inactive-only filter", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await skillService.list({ active: false });
    expect(api.get).toHaveBeenCalledWith(`${BASE}/skills/`, {
      params: { active: "false" },
    });
  });

  it("skillService.create POSTs to /plugins/skills/skills/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await skillService.create({ name: "Python" });
    expect(api.post).toHaveBeenCalledWith(`${BASE}/skills/`, { name: "Python" });
  });

  it("userSkillService.list calls /plugins/skills/user-skills/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await userSkillService.list();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/user-skills/`, { params: {} });
  });

  it("userSkillService.rate POSTs to /plugins/skills/user-skills/:id/rate/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await userSkillService.rate(5, { level: 3 });
    expect(api.post).toHaveBeenCalledWith(`${BASE}/user-skills/5/rate/`, { level: 3 });
  });

  it("matrixService.matrix calls /plugins/skills/matrix/matrix/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await matrixService.matrix();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/matrix/matrix/`, { params: {} });
  });

  it("matrixService.coverage calls /plugins/skills/matrix/coverage/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await matrixService.coverage();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/matrix/coverage/`, { params: {} });
  });

  it("gapReportService.gaps calls /plugins/skills/gap-report/gaps/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await gapReportService.gaps();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/gap-report/gaps/`, { params: {} });
  });

  it("gapReportService.gaps passes top_n when provided", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await gapReportService.gaps("backend", undefined, 5);
    expect(api.get).toHaveBeenCalledWith(`${BASE}/gap-report/gaps/`, {
      params: { category: "backend", top_n: "5" },
    });
  });

  it("skillExportService.export calls /plugins/skills/export/export/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: new Blob() } as any);
    await skillExportService.export();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/export/export/`, {
      params: {},
      responseType: "blob",
    });
  });

  it("historyService.list calls /plugins/skills/history/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await historyService.list();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/history/`, { params: {} });
  });

  it("skillExportService.export passes search param when provided", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: new Blob() } as any);
    await skillExportService.export(undefined, "alice");
    expect(api.get).toHaveBeenCalledWith(`${BASE}/export/export/`, {
      params: { search: "alice" },
      responseType: "blob",
    });
  });

  it("skillExportService.export omits search param when not provided", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: new Blob() } as any);
    await skillExportService.export();
    const call = vi.mocked(api.get).mock.calls[0];
    expect((call[1] as any).params).not.toHaveProperty("search");
  });

  it("historyService.list passes date_from and date_to params", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await historyService.list(undefined, undefined, undefined, "2026-01-01", "2026-08-31");
    expect(api.get).toHaveBeenCalledWith(`${BASE}/history/`, {
      params: { date_from: "2026-01-01", date_to: "2026-08-31" },
    });
  });

  it("historyService.list omits date params when not provided", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await historyService.list();
    const call = vi.mocked(api.get).mock.calls[0];
    expect((call[1] as any).params).not.toHaveProperty("date_from");
    expect((call[1] as any).params).not.toHaveProperty("date_to");
  });

  it("never uses /api/ prefix (no doubled api)", () => {
    // Meta-test: verify BASE doesn't contain /api/
    expect(BASE).not.toContain("/api/");
    expect(BASE).toBe("/plugins/skills");
  });
});
