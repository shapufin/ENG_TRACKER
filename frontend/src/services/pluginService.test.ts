import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { pluginService } from "./pluginService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

vi.mock("@/lib/api-utils", () => ({ extractResponseResults: (r: any) => r.data }));

beforeEach(() => vi.clearAllMocks());

describe("pluginService URL contracts", () => {
  it("getPlugins calls /plugins/management/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await pluginService.getPlugins();
    expect(api.get).toHaveBeenCalledWith("/plugins/management/");
  });

  it("discoverPlugins calls /plugins/management/discover/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await pluginService.discoverPlugins();
    expect(api.get).toHaveBeenCalledWith("/plugins/management/discover/");
  });

  it("togglePlugin POSTs to /plugins/management/:id/toggle/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await pluginService.togglePlugin(1);
    expect(api.post).toHaveBeenCalledWith("/plugins/management/1/toggle/");
  });

  it("initializePlugin POSTs to /plugins/management/:id/activate/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await pluginService.initializePlugin(2);
    expect(api.post).toHaveBeenCalledWith("/plugins/management/2/activate/");
  });

  it("getActiveMetadata calls /plugins/management/active_metadata/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await pluginService.getActiveMetadata();
    expect(api.get).toHaveBeenCalledWith("/plugins/management/active_metadata/");
  });

  it("never uses /api/ prefix", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await pluginService.getPlugins();
    const url = vi.mocked(api.get).mock.calls[0][0];
    expect(url).not.toMatch(/^\/api\//);
  });
});
