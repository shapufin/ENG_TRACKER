import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { reportService } from "./reportService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe("reportService URL contracts", () => {
  it("getSummary calls /reports/summary/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await reportService.getSummary({});
    expect(api.get).toHaveBeenCalledWith("/reports/summary/", { params: {} });
  });

  it("getDetailed calls /reports/detailed/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await reportService.getDetailed({});
    expect(api.get).toHaveBeenCalledWith("/reports/detailed/", { params: {} });
  });

  it("getTeams calls /users/teams/list_for_reports/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await reportService.getTeams();
    expect(api.get).toHaveBeenCalledWith("/users/teams/list_for_reports/");
  });

  it("getTemplates calls /reports/templates/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await reportService.getTemplates();
    expect(api.get).toHaveBeenCalledWith("/reports/templates/");
  });

  it("applyTemplate POSTs to /reports/templates/:id/apply/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await reportService.applyTemplate(1);
    expect(api.post).toHaveBeenCalledWith("/reports/templates/1/apply/");
  });

  it("never uses /api/ prefix", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await reportService.getSummary({});
    const url = vi.mocked(api.get).mock.calls[0][0];
    expect(url).not.toMatch(/^\/api\//);
  });
});
