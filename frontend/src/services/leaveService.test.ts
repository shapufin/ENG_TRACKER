import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { leaveService } from "./leaveService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

vi.mock("@/lib/offline/offlineQueue", () => ({
  requestWithOfflineQueue: vi.fn(async (fn: () => Promise<any>) => fn()),
}));

vi.mock("./bulkActionHelpers", () => ({
  bulkApproveEntities: vi.fn(),
  rejectEntity: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("leaveService URL contracts", () => {
  it("getRequests calls /leave-management/requests/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await leaveService.getRequests();
    expect(api.get).toHaveBeenCalledWith("/leave-management/requests/", { params: undefined });
  });

  it("getRequest calls /leave-management/requests/:id/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await leaveService.getRequest(1);
    expect(api.get).toHaveBeenCalledWith("/leave-management/requests/1/");
  });

  it("getTeamLogs calls /leave-management/requests/team_logs/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await leaveService.getTeamLogs();
    expect(api.get).toHaveBeenCalledWith("/leave-management/requests/team_logs/", {
      params: undefined,
    });
  });

  it("getBalances calls /leave-management/balances/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [] } } as any);
    await leaveService.getBalances();
    expect(api.get).toHaveBeenCalledWith("/leave-management/balances/", { params: undefined });
  });

  it("getSettings calls /leave-management/settings/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [{ id: 1 }] } } as any);
    await leaveService.getSettings();
    expect(api.get).toHaveBeenCalledWith("/leave-management/settings/");
  });

  it("approve POSTs to /leave-management/requests/:id/approve/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await leaveService.approve(5);
    expect(api.post).toHaveBeenCalledWith("/leave-management/requests/5/approve/");
  });

  it("never uses /api/ prefix", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await leaveService.getRequests();
    const url = vi.mocked(api.get).mock.calls[0][0];
    expect(url).not.toMatch(/^\/api\//);
  });
});
