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

describe("leaveService.getAllRequests (audit 2026-11-17 M5)", () => {
  it("follows every page, so a list over one page is never cut", async () => {
    const page = (start: number, size: number) =>
      Array.from({ length: size }, (_, i) => ({ id: start + i }));
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { results: page(0, 1000), count: 1500, next: "p2" } } as any)
      .mockResolvedValueOnce({ data: { results: page(1000, 500), count: 1500, next: null } } as any);

    const rows = await leaveService.getAllRequests({ ignore_date_filter: "true" });

    expect(rows).toHaveLength(1500);
    expect(api.get).toHaveBeenNthCalledWith(2, "/leave-management/requests/", {
      params: { ignore_date_filter: "true", page_size: 1000, page: 2 },
    });
  });
});

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
