import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { tlScorecardService } from "./tlScorecardService";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

describe("tlScorecardService list helpers", () => {
  beforeEach(() => vi.mocked(api.get).mockReset());

  it("follows pagination so no record is dropped after page one", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { results: [{ id: 1 }], next: "http://x/?page=2" } } as never)
      .mockResolvedValueOnce({ data: { results: [{ id: 2 }], next: null } } as never);
    const rows = await tlScorecardService.listPIPRecords();
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.get).mock.calls[1][1]).toEqual({ params: { page: 2 } });
  });

  it("accepts an unpaginated array in one call", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [{ id: 7 }] } as never);
    expect(await tlScorecardService.listEPRCycles()).toHaveLength(1);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
