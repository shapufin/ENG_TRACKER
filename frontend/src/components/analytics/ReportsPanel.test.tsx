import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReportsPanel } from "./ReportsPanel";

// Mock api module
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
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

describe("ReportsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the panel with generate button", async () => {
    mockApi.get.mockResolvedValue({ data: { results: [] } });

    renderWithProviders(<ReportsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Background Exports")).toBeInTheDocument();
    });
    expect(screen.getByText("Generate")).toBeInTheDocument();
  });

  it("displays existing export jobs", async () => {
    mockApi.get.mockResolvedValue({
      data: {
        results: [
          {
            job_id: 1,
            status: "completed",
            format: "excel",
            file_size_bytes: 1024,
            error_message: null,
            created_at: "2026-08-07T10:00:00Z",
            completed_at: "2026-08-07T10:01:00Z",
          },
        ],
      },
    });

    renderWithProviders(<ReportsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Export #1")).toBeInTheDocument();
    });
    expect(screen.getByText("Download")).toBeInTheDocument();
  });

  it("creates a job when Generate is clicked", async () => {
    mockApi.get.mockResolvedValue({ data: { results: [] } });
    mockApi.post.mockResolvedValue({ data: { job_id: 42, status: "pending" } });

    renderWithProviders(<ReportsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Generate")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Generate"));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        "plugins/analytics/metrics/export-jobs/create/",
        expect.objectContaining({ format: "excel" }),
      );
    });
  });

  it("shows failed job error message", async () => {
    mockApi.get.mockResolvedValue({
      data: {
        results: [
          {
            job_id: 2,
            status: "failed",
            format: "csv",
            file_size_bytes: 0,
            error_message: "Database error",
            created_at: "2026-08-07T10:00:00Z",
            completed_at: "2026-08-07T10:01:00Z",
          },
        ],
      },
    });

    renderWithProviders(<ReportsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Export #2")).toBeInTheDocument();
    });
    expect(screen.getByText(/Database error/)).toBeInTheDocument();
  });
});
