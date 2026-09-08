import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { overtimeService } from "./overtimeService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

vi.mock("@/lib/api-utils", () => ({ normalizeList: (d: any) => (Array.isArray(d) ? d : d?.results ?? []) }));
vi.mock("@/lib/download", () => ({ downloadBlobResponse: vi.fn(), paginatedFetchAll: vi.fn() }));
vi.mock("@/lib/offline/offlineQueue", () => ({
  requestWithOfflineQueue: vi.fn(async (fn: () => Promise<any>) => fn()),
}));
vi.mock("./bulkActionHelpers", () => ({
  bulkApproveEntities: vi.fn(),
  rejectEntity: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("overtimeService URL contracts", () => {
  it("getClients calls /overtime/clients/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await overtimeService.getClients();
    expect(api.get).toHaveBeenCalledWith("/overtime/clients/", { params: undefined });
  });

  it("getLogs calls /overtime/logs/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await overtimeService.getLogs();
    expect(api.get).toHaveBeenCalledWith("/overtime/logs/", { params: undefined });
  });

  it("getLog calls /overtime/logs/:id/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await overtimeService.getLog(7);
    expect(api.get).toHaveBeenCalledWith("/overtime/logs/7/");
  });

  it("approve POSTs to /overtime/logs/:id/approve/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await overtimeService.approve(3);
    expect(api.post).toHaveBeenCalledWith("/overtime/logs/3/approve/");
  });

  it("deleteLog DELETEs /overtime/logs/:id/?ignore_date_filter=true", async () => {
    vi.mocked(api.delete).mockResolvedValue({} as any);
    await overtimeService.deleteLog(4);
    expect(api.delete).toHaveBeenCalledWith("/overtime/logs/4/?ignore_date_filter=true");
  });

  it("getSummary calls /overtime/logs/summary/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await overtimeService.getSummary();
    expect(api.get).toHaveBeenCalledWith("/overtime/logs/summary/");
  });

  it("never uses /api/ prefix", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [], count: 0 } } as any);
    await overtimeService.getLogs();
    const url = vi.mocked(api.get).mock.calls[0][0];
    expect(url).not.toMatch(/^\/api\//);
  });
});
