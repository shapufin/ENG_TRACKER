/** Tests for the Organigrama admin service. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { organigramaAdminService } from "../services/organigramaAdminService";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ default: mocks }));

describe("organigramaAdminService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches charts and extracts results", async () => {
    mocks.get.mockResolvedValue({
      data: { count: 1, results: [{ id: 1, name: "Engineering" }] },
    });
    const result = await organigramaAdminService.getCharts({ status: "draft" });
    expect(mocks.get).toHaveBeenCalledWith("/plugins/organigrama/charts/", {
      params: { status: "draft" },
    });
    expect(result).toEqual([{ id: 1, name: "Engineering" }]);
  });

  it("creates a chart", async () => {
    mocks.post.mockResolvedValue({ data: { id: 2, name: "New" } });
    const result = await organigramaAdminService.createChart({ name: "New" });
    expect(mocks.post).toHaveBeenCalledWith("/plugins/organigrama/charts/", { name: "New" });
    expect(result).toEqual({ id: 2, name: "New" });
  });

  it("fetches a single chart", async () => {
    mocks.get.mockResolvedValue({ data: { id: 3, name: "One" } });
    const result = await organigramaAdminService.getChart(3);
    expect(mocks.get).toHaveBeenCalledWith("/plugins/organigrama/charts/3/");
    expect(result).toEqual({ id: 3, name: "One" });
  });

  it("saves a draft with PUT", async () => {
    mocks.put.mockResolvedValue({ data: { revision_number: 1, nodes: [], edges: [] } });
    const result = await organigramaAdminService.saveDraft(7, {
      revision_number: 0,
      nodes: [],
      edges: [],
    });
    expect(mocks.put).toHaveBeenCalledWith("/plugins/organigrama/charts/7/draft/", {
      revision_number: 0,
      nodes: [],
      edges: [],
    });
    expect(result).toEqual({ revision_number: 1, nodes: [], edges: [] });
  });

  it("validates a draft", async () => {
    mocks.post.mockResolvedValue({ data: { is_valid: true, errors: [] } });
    const result = await organigramaAdminService.validateDraft(8, {
      revision_number: 0,
      nodes: [],
      edges: [],
    });
    expect(mocks.post).toHaveBeenCalledWith("/plugins/organigrama/charts/8/validate/", {
      revision_number: 0,
      nodes: [],
      edges: [],
    });
    expect(result.is_valid).toBe(true);
  });

  it("deletes a chart", async () => {
    mocks.delete.mockResolvedValue({});
    await organigramaAdminService.deleteChart(5);
    expect(mocks.delete).toHaveBeenCalledWith("/plugins/organigrama/charts/5/");
  });
});
