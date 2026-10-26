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

  it("lists a snapshot's files", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await yearCloseService.listFiles(3);
    expect(api.get).toHaveBeenCalledWith(`${BASE}/snapshots/3/files/`);
  });

  it("mints a download link with POST, never a blob GET", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { url: "/u?token=t" } } as any);
    const url = await yearCloseService.getDownloadUrl(9);
    expect(api.post).toHaveBeenCalledWith(`${BASE}/files/9/download-link/`);
    expect(url).toBe("/u?token=t");
    expect(api.get).not.toHaveBeenCalled();
  });
});
