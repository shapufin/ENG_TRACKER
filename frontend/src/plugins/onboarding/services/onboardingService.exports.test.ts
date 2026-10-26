import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { onboardingService } from "./onboardingService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

describe("onboardingService exports and purge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requests a client export", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 9, status: "pending" } });
    const result = await onboardingService.createClientExport(3);
    expect(api.post).toHaveBeenCalledWith("/plugins/onboarding/clients/3/exports/");
    expect(result.id).toBe(9);
  });

  it("requests the all-clients export", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 10, kind: "all" } });
    await onboardingService.createAllClientsExport();
    expect(api.post).toHaveBeenCalledWith("/plugins/onboarding/exports/all/");
  });

  it("reads an export's status", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { id: 9, status: "ready" } });
    await onboardingService.getExport(9);
    expect(api.get).toHaveBeenCalledWith("/plugins/onboarding/exports/9/");
  });

  it("asks for a single-use download link and returns the url", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { url: "/api/x/download/?token=t" } });
    await expect(onboardingService.getExportDownloadUrl(9)).resolves.toBe("/api/x/download/?token=t");
    expect(api.post).toHaveBeenCalledWith("/plugins/onboarding/exports/9/download-link/");
  });

  it("loads the purge status of a client", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { can_purge: false, blockers: ["x"] } });
    await onboardingService.getClientLifecycle(3);
    expect(api.get).toHaveBeenCalledWith("/plugins/onboarding/clients/3/lifecycle/");
  });

  it("purges with the typed client code", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { folders: 1, documents: 2 } });
    await onboardingService.purgeClientOnboarding(3, "OLD");
    expect(api.post).toHaveBeenCalledWith("/plugins/onboarding/clients/3/purge/", {
      confirm_code: "OLD",
    });
  });

  it("lists archived clients for superusers", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [{ id: 1, name: "Old", code: "OLD" }] });
    await onboardingService.getArchivedClients();
    expect(api.get).toHaveBeenCalledWith("/plugins/onboarding/clients/", {
      params: { archived: "true" },
    });
  });
});
