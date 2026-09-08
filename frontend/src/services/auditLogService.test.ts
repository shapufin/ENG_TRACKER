import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { auditLogService } from "./auditLogService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe("auditLogService URL contracts", () => {
  it("getSummary calls /plugins/audit_log/logs/summary/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await auditLogService.getSummary();
    expect(api.get).toHaveBeenCalledWith("/plugins/audit_log/logs/summary/");
  });

  it("getRecentLogs calls /plugins/audit_log/logs/summary/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { recent_logs: [] } } as any);
    await auditLogService.getRecentLogs(5);
    expect(api.get).toHaveBeenCalledWith("/plugins/audit_log/logs/summary/");
  });

  it("never uses /api/ prefix", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await auditLogService.getSummary();
    const url = vi.mocked(api.get).mock.calls[0][0];
    expect(url).not.toMatch(/^\/api\//);
  });
});
