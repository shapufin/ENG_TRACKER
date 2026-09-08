import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { dataImportService } from "./dataImportService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

const BASE = "/plugins/data_import";

beforeEach(() => vi.clearAllMocks());

describe("dataImportService URL contracts", () => {
  it("getTargets calls /plugins/data_import/targets/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { targets: [] } } as any);
    await dataImportService.getTargets();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/targets/`);
  });

  it("listProfiles calls /plugins/data_import/profiles/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await dataImportService.listProfiles("users");
    expect(api.get).toHaveBeenCalledWith(`${BASE}/profiles/`, { params: { target_key: "users" } });
  });

  it("createProfile POSTs to /plugins/data_import/profiles/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await dataImportService.createProfile({} as any);
    expect(api.post).toHaveBeenCalledWith(`${BASE}/profiles/`, {});
  });

  it("updateProfile PUTs /plugins/data_import/profiles/:id/", async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} } as any);
    await dataImportService.updateProfile(1, {});
    expect(api.put).toHaveBeenCalledWith(`${BASE}/profiles/1/`, {});
  });

  it("deleteProfile DELETEs /plugins/data_import/profiles/:id/", async () => {
    vi.mocked(api.delete).mockResolvedValue({} as any);
    await dataImportService.deleteProfile(2);
    expect(api.delete).toHaveBeenCalledWith(`${BASE}/profiles/2/`);
  });

  it("listBatches calls /plugins/data_import/import/batches/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await dataImportService.listBatches();
    expect(api.get).toHaveBeenCalledWith(`${BASE}/import/batches/`, { params: {} });
  });

  it("never uses /api/ prefix", () => {
    expect(BASE).not.toContain("/api/");
    expect(BASE).toBe("/plugins/data_import");
  });
});
