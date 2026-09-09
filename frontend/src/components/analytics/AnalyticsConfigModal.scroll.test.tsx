import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnalyticsConfigModal } from "./AnalyticsConfigModal";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}));

import api from "@/lib/api";

const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };

const config = {
  id: 1,
  snapshot_frequency: "daily",
  data_retention_days: 365,
  enabled_metrics: [],
  auto_snapshot_enabled: true,
  trend_threshold: 0.15,
  concentration_threshold: 0.4,
  spike_threshold: 2.0,
  backlog_threshold: 5,
  status_bottleneck_threshold: 0.3,
};

const renderModal = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AnalyticsConfigModal open onOpenChange={() => {}} />
    </QueryClientProvider>
  );
};

// Scroll contract: the ~160-line form must scroll in the body while the
// header and the Save footer stay visible.
describe("AnalyticsConfigModal scroll contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: config });
  });

  it("dialog is a bounded flex column with a scrollable body and sticky footer", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByLabelText("Trend Change (%)")).toBeInTheDocument();
    });
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).not.toContain("overflow-y-auto");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".shrink-0").length).toBeGreaterThan(0);
  });
});
