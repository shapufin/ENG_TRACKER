import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScheduledReportsPanel } from "./ScheduledReportsPanel";

// Mock api module
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import api from "@/lib/api";

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

const defaultProps = {
  currentFilters: {
    period: "month",
    teams: [],
    users: [],
    statuses: [],
    categories: [],
  },
};

describe("ScheduledReportsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the panel with New button", async () => {
    mockApi.get.mockResolvedValue({ data: { results: [] } });

    renderWithProviders(<ScheduledReportsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Scheduled Reports")).toBeInTheDocument();
    });
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("shows empty state when no reports exist", async () => {
    mockApi.get.mockResolvedValue({ data: { results: [] } });

    renderWithProviders(<ScheduledReportsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText("No scheduled reports. Create one to automate report delivery via email.")
      ).toBeInTheDocument();
    });
  });

  it("displays existing scheduled reports", async () => {
    mockApi.get.mockResolvedValue({
      data: {
        results: [
          {
            id: 1,
            name: "Weekly OT Summary",
            description: "Weekly overtime report",
            schedule_type: "weekly",
            schedule_type_display: "Weekly",
            recipients: ["alice@company.com"],
            filter_preset: {},
            report_format: "excel",
            report_format_display: "Excel",
            is_active: true,
            last_run_at: "2026-08-01T10:00:00Z",
            next_run_at: "2026-08-08T10:00:00Z",
          },
        ],
      },
    });

    renderWithProviders(<ScheduledReportsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Weekly OT Summary")).toBeInTheDocument();
    });
    expect(screen.getByText("Weekly")).toBeInTheDocument();
    expect(screen.getByText("1 recipient")).toBeInTheDocument();
  });

  it("opens create form when New is clicked", async () => {
    mockApi.get.mockResolvedValue({ data: { results: [] } });

    renderWithProviders(<ScheduledReportsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("New")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("New"));

    await waitFor(() => {
      expect(screen.getByText("Report Name")).toBeInTheDocument();
    });
    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText("Recipients (comma-separated emails)")).toBeInTheDocument();
  });

  it("shows cron hint at bottom", async () => {
    mockApi.get.mockResolvedValue({ data: { results: [] } });

    renderWithProviders(<ScheduledReportsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/python manage.py run_scheduled_reports/)).toBeInTheDocument();
    });
  });
});
