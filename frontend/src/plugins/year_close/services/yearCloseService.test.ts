import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { yearCloseService } from "./yearCloseService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("@/lib/api-utils", () => ({
  normalizeList: (data: any) => (Array.isArray(data) ? data : (data?.results ?? [])),
}));

const BASE = "/plugins/year_close";

beforeEach(() => vi.clearAllMocks());

describe("yearCloseService URL contracts", () => {
  it("lists snapshots from /plugins/year_close/snapshots/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [{ id: 1, year: 2025 }] } } as any);
    const rows = await yearCloseService.listSnapshots();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/snapshots/`);
    expect(rows).toEqual([{ id: 1, year: 2025 }]);
  });

  it("mints a download link with POST, never a blob GET", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { url: "/u?token=t" } } as any);
    const url = await yearCloseService.getDownloadUrl(9);
    expect(api.post).toHaveBeenCalledWith(`${BASE}/files/9/download-link/`);
    expect(url).toBe("/u?token=t");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("lists archives, verifies a file and exports a leader through the API contracts", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await yearCloseService.listArchives();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/archives/`);
    await yearCloseService.listLeaderHistory(2025);
    expect(api.get).toHaveBeenCalledWith(`${BASE}/archives/leaders/`, { params: { year: 2025 } });
    vi.mocked(api.post).mockResolvedValue({ data: { result: "ok" } } as any);
    expect(await yearCloseService.verifyFile(4)).toBe("ok");
    expect(api.post).toHaveBeenCalledWith(`${BASE}/files/4/verify/`);
    await yearCloseService.exportLeader(2025, 9);
    expect(api.get).toHaveBeenCalledWith(`${BASE}/archives/leaders/export/`, {
      params: { year: 2025, leader: 9 },
      responseType: "blob",
    });
  });
});
