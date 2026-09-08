import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
}));

import { overtimeService } from "./overtimeService";

describe("overtimeService.downloadAllLogs — paginated fetch loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loops pages until next is null", async () => {
    const mockGet = vi.mocked(api.get);
    mockGet
      .mockResolvedValueOnce({
        data: {
          results: [{ id: 1, user: 5 }],
          next: "http://api/overtime/logs/?page=2",
          count: 3,
        },
      })
      .mockResolvedValueOnce({
        data: {
          results: [
            { id: 2, user: 5 },
            { id: 3, user: 5 },
          ],
          next: null,
          count: 3,
        },
      });

    const result = await overtimeService.downloadAllLogs({ status: "approved" });

    expect(result).toHaveLength(3);
    expect(mockGet).toHaveBeenCalledTimes(2);
    // First call: page 1
    expect(mockGet).toHaveBeenNthCalledWith(1, "/overtime/logs/", {
      params: { status: "approved", page: 1, page_size: 500 },
    });
    // Second call: page 2
    expect(mockGet).toHaveBeenNthCalledWith(2, "/overtime/logs/", {
      params: { status: "approved", page: 2, page_size: 500 },
    });
  });

  it("stops at page 1 when next is null immediately", async () => {
    const mockGet = vi.mocked(api.get);
    mockGet.mockResolvedValueOnce({
      data: { results: [{ id: 1, user: 5 }], next: null, count: 1 },
    });

    const result = await overtimeService.downloadAllLogs();
    expect(result).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("hits the 100-page safety valve if next never becomes null", async () => {
    const mockGet = vi.mocked(api.get);
    mockGet.mockResolvedValue({
      data: { results: [{ id: 1, user: 5 }], next: "never-null", count: 999 },
    });

    const result = await overtimeService.downloadAllLogs();
    // 100 pages × 1 row = 100 rows (safety valve prevents infinite loop).
    expect(result).toHaveLength(100);
    expect(mockGet).toHaveBeenCalledTimes(100);
  });
});
