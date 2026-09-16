import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TicketKPITeamManagementPage } from "./TicketKPITeamManagementPage";
import { ticketKPIService } from "../services/ticketKPIService";
import { toast } from "sonner";

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => ({ isTeamLeader: true, isAdmin: false, isHR: false }),
}));

vi.mock("../services/ticketKPIService", () => ({
  ticketKPIService: {
    getTeamBatches: vi.fn(),
    deleteTeamBatch: vi.fn(),
    bulkReviewBatches: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const BATCHES = [
  {
    id: 1,
    user: 10,
    username: "alice",
    month: "2026-03-01",
    profile: 1,
    profile_name: "P",
    record_count: 5,
    is_overridden: false,
    is_reviewed: false,
    created_at: "2026-04-01T00:00:00Z",
  },
  {
    id: 2,
    user: 11,
    username: "bob",
    month: "2026-03-01",
    profile: 1,
    profile_name: "P",
    record_count: 3,
    is_overridden: false,
    is_reviewed: false,
    created_at: "2026-04-01T00:00:00Z",
  },
];

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

describe("TicketKPITeamManagementPage — bulk review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ticketKPIService.getTeamBatches).mockResolvedValue(BATCHES as any);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the Review Selected action only once a row is checked", async () => {
    render(<TicketKPITeamManagementPage />, { wrapper });
    await screen.findByText("alice");
    expect(screen.queryByText("Review Selected")).not.toBeInTheDocument();

    // DataTable's built-in row checkbox uses a generic "Select row" label
    // (not per-user) — the first one corresponds to alice's row (rendered
    // first in BATCHES).
    fireEvent.click(screen.getAllByLabelText("Select row")[0]);
    expect(screen.getByText("Review Selected")).toBeInTheDocument();
    // BulkActionBar (shared component, CLAUDE.md-required) renders the count
    // via AnimatedNumber in its own badge, separate from the "upload
    // selected" text node — not one concatenated string.
    expect(screen.getByLabelText("1 selected")).toBeInTheDocument();
    expect(screen.getByText("upload selected")).toBeInTheDocument();
  });

  it("bulk-reviews every checked batch and clears selection on success", async () => {
    vi.mocked(ticketKPIService.bulkReviewBatches).mockResolvedValue({
      data: { reviewed: [1, 2], skipped: [] },
    } as any);

    render(<TicketKPITeamManagementPage />, { wrapper });
    await screen.findByText("alice");

    fireEvent.click(screen.getByLabelText("Select all rows on this page"));
    await act(async () => {
      fireEvent.click(screen.getByText("Review Selected"));
    });

    expect(ticketKPIService.bulkReviewBatches).toHaveBeenCalledWith([1, 2]);
    expect(toast.success).toHaveBeenCalledWith("Reviewed 2 upload(s).");
    expect(screen.queryByText("Review Selected")).not.toBeInTheDocument();
  });

  it("warns with the skip reason when a batch could not be reviewed", async () => {
    vi.mocked(ticketKPIService.bulkReviewBatches).mockResolvedValue({
      data: { reviewed: [1], skipped: [{ batch_id: 2, reason: "Batch not found." }] },
    } as any);

    render(<TicketKPITeamManagementPage />, { wrapper });
    await screen.findByText("alice");

    fireEvent.click(screen.getByLabelText("Select all rows on this page"));
    await act(async () => {
      fireEvent.click(screen.getByText("Review Selected"));
    });

    expect(toast.warning).toHaveBeenCalledWith(
      "Reviewed 1 upload(s); skipped 1 (Batch not found.)."
    );
  });
});
