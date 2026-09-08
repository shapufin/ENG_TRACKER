import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { auditService } from "./auditService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe("auditService URL contracts", () => {
  it("getLogs calls /reports/audit-logs/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await auditService.getLogs();
    expect(api.get).toHaveBeenCalledWith("/reports/audit-logs/", { params: {} });
  });

  it("getStats calls /reports/audit-logs/stats/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await auditService.getStats();
    expect(api.get).toHaveBeenCalledWith("/reports/audit-logs/stats/", { params: {} });
  });

  it("getLogHistory calls /reports/audit-logs/history/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await auditService.getLogHistory("User", "1");
    expect(api.get).toHaveBeenCalledWith("/reports/audit-logs/history/", {
      params: { model_name: "User", object_id: "1" },
    });
  });

  it("never uses /api/ prefix", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await auditService.getLogs();
    const url = vi.mocked(api.get).mock.calls[0][0];
    expect(url).not.toMatch(/^\/api\//);
  });
});
