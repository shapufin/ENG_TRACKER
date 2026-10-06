import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { tlScorecardService } from "./tlScorecardService";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

describe("tlScorecardService list helpers", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

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

  it("posts the Workday PDF as request-scoped multipart preview data", async () => {
    const file = new File(["%PDF-1.4"], "goals.pdf", { type: "application/pdf" });
    vi.mocked(api.post).mockResolvedValueOnce({ data: { goal_titles: ["Goal A"] } });

    await tlScorecardService.parseEPRGoalPdf(7, "mid_year", file);

    const [path, body, config] = vi.mocked(api.post).mock.calls[0];
    expect(path).toBe("/plugins/tl_scorecard/epr-cycles/7/parse_goal_pdf/");
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("stage")).toBe("mid_year");
    expect((body as FormData).get("file")).toBe(file);
    // The api instance defaults to JSON; without this header Django parses no FILES.
    expect(config).toEqual({ headers: { "Content-Type": "multipart/form-data" } });
  });
});
