import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnalyticsConfigModal } from "./AnalyticsConfigModal";

// Mock api module
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

import api from "@/lib/api";

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

describe("AnalyticsConfigModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders threshold fields when open", async () => {
    mockApi.get.mockResolvedValue({
      data: {
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
      },
    });

    renderWithProviders(<AnalyticsConfigModal open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Trend Change (%)")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Concentration Share (%)")).toBeInTheDocument();
    expect(screen.getByLabelText("Spike Multiplier (x avg)")).toBeInTheDocument();
    expect(screen.getByLabelText("Backlog (min pending)")).toBeInTheDocument();
    expect(screen.getByLabelText("Status Bottleneck (% pending)")).toBeInTheDocument();
  });

  it("saves threshold values via PATCH", async () => {
    mockApi.get.mockResolvedValue({
      data: {
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
      },
    });
    mockApi.patch.mockResolvedValue({ data: {} });

    renderWithProviders(<AnalyticsConfigModal open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Trend Change (%)")).toBeInTheDocument();
    });

    // Change trend threshold to 25% (stored as 0.25)
    const trendInput = screen.getByLabelText("Trend Change (%)");
    fireEvent.change(trendInput, { target: { value: "25" } });

    // Save
    const saveButton = screen.getByText("Save Changes");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        "plugins/analytics/configuration/1/",
        expect.objectContaining({ trend_threshold: 0.25 })
      );
    });
  });
});
