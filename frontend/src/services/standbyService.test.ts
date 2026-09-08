import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { standbyService } from "./standbyService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

vi.mock("@/lib/download", () => ({ downloadBlobResponse: vi.fn(), paginatedFetchAll: vi.fn() }));
vi.mock("@/lib/offline/offlineQueue", () => ({
  requestWithOfflineQueue: vi.fn(async (fn: () => Promise<any>) => fn()),
}));
vi.mock("./bulkActionHelpers", () => ({
  bulkApproveEntities: vi.fn(),
  rejectEntity: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("standbyService URL contracts", () => {
  it("getLogs calls /standby/logs/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await standbyService.getLogs();
    expect(api.get).toHaveBeenCalledWith("/standby/logs/", { params: undefined });
  });

  it("getLog calls /standby/logs/:id/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await standbyService.getLog(2);
    expect(api.get).toHaveBeenCalledWith("/standby/logs/2/");
  });

  it("approve POSTs to /standby/logs/:id/approve/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await standbyService.approve(5);
    expect(api.post).toHaveBeenCalledWith("/standby/logs/5/approve/");
  });

  it("deleteLog DELETEs /standby/logs/:id/?ignore_date_filter=true", async () => {
    vi.mocked(api.delete).mockResolvedValue({} as any);
    await standbyService.deleteLog(6);
    expect(api.delete).toHaveBeenCalledWith("/standby/logs/6/?ignore_date_filter=true");
  });

  it("getTeamLogs calls /standby/logs/team_logs/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await standbyService.getTeamLogs();
    expect(api.get).toHaveBeenCalledWith("/standby/logs/team_logs/", { params: undefined });
  });

  it("never uses /api/ prefix", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await standbyService.getLogs();
    const url = vi.mocked(api.get).mock.calls[0][0];
    expect(url).not.toMatch(/^\/api\//);
  });
});
