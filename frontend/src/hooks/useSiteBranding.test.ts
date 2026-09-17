import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useSiteBranding, DEFAULT_SITE_NAME } from "./useSiteBranding";
import { dashboardService } from "@/services/dashboardService";
import { createWrapper } from "@/test/hookTestUtils";

vi.mock("@/services/dashboardService", () => ({
  dashboardService: { getBranding: vi.fn() },
}));

describe("useSiteBranding", () => {
  beforeEach(() => {
    document.title = "stale";
  });

  it("syncs document.title to the resolved site_name", async () => {
    vi.mocked(dashboardService.getBranding).mockResolvedValue({
      id: 1, site_name: "Acme Tracker", logo: null, logo_url: null,
    });
    const queryClient = new QueryClient();
    renderHook(() => useSiteBranding(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(document.title).toBe("Acme Tracker"));
  });

  it("falls back to the default title on error", async () => {
    vi.mocked(dashboardService.getBranding).mockRejectedValue(new Error("fail"));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useSiteBranding(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(document.title).toBe(DEFAULT_SITE_NAME));
  });
});
