import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { organigramaService } from "./organigramaService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

vi.mock("@/lib/api-utils", () => ({ extractResponseResults: (r: any) => r.data }));

const BASE = "/plugins/organigrama";

beforeEach(() => vi.clearAllMocks());

describe("organigramaService URL contracts", () => {
  it("getTree calls /plugins/organigrama/tree/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await organigramaService.getTree();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/tree/`);
  });

  it("getVisibleCharts calls /plugins/organigrama/charts/visible/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await organigramaService.getVisibleCharts();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/charts/visible/`);
  });

  it("getPublishedChart calls /plugins/organigrama/charts/:id/published/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await organigramaService.getPublishedChart(3);
    expect(api.get).toHaveBeenCalledWith(`${BASE}/charts/3/published/`);
  });

  it("getSubtree calls /plugins/organigrama/subtree/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { children: [] } } as any);
    await organigramaService.getSubtree(1, "person");
    expect(api.get).toHaveBeenCalledWith(`${BASE}/subtree/`, {
      params: { node_id: 1, node_type: "person" },
    });
  });

  it("never uses /api/ prefix", () => {
    expect(BASE).not.toContain("/api/");
    expect(BASE).toBe("/plugins/organigrama");
  });
});
