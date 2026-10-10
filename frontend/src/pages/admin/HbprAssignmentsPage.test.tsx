import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { HbprAssignmentsPage } from "./HbprAssignmentsPage";
import { hbprAssignmentService } from "@/services/hbprAssignmentService";
import api from "@/lib/api";

vi.mock("@/services/hbprAssignmentService", () => ({
  hbprAssignmentService: {
    list: vi.fn(),
    create: vi.fn(),
    end: vi.fn(),
    reassign: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
}));

// DataTable (TanStack) needs ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const assignment = {
  id: 1,
  hbpr: 10,
  albanian_tl: 20,
  hbpr_detail: { id: 10, name: "Elda Partner" },
  albanian_tl_detail: { id: 20, name: "Enri Leader" },
  cadence: "weekly" as const,
  effective_from: "2026-01-01",
  effective_to: null,
  is_current: true,
  last_meeting_on: "2026-09-01",
  next_due_on: "2026-09-08",
  cadence_status: "on_track" as const,
  evidence_count: 0,
};

const endedAssignment = {
  ...assignment,
  id: 3,
  hbpr_detail: { id: 11, name: "Olda Partner" },
  albanian_tl_detail: { id: 21, name: "Olsa Leader" },
  effective_to: "2026-06-30",
  is_current: false,
  cadence_status: "ended" as const,
  evidence_count: 2,
};

// Radix Tabs activate a trigger on mousedown.
const openArchiveTab = async () =>
  fireEvent.mouseDown(await screen.findByRole("tab", { name: /archive/i }));

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HbprAssignmentsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("HbprAssignmentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: { results: [] } } as never);
  });

  it("renders the assignments table", async () => {
    vi.mocked(hbprAssignmentService.list).mockResolvedValue({
      data: [assignment],
    } as never);
    renderPage();
    expect(await screen.findByText("Elda Partner")).toBeInTheDocument();
    expect(screen.getByText("Enri Leader")).toBeInTheDocument();
    expect(screen.getByText("Weekly")).toBeInTheDocument();
    expect(screen.getByText("On track")).toBeInTheDocument();
    expect(screen.getByText("2026-09-08")).toBeInTheDocument();
    expect(screen.getByText("2026-01-01")).toBeInTheDocument();
  });

  it("shows an empty state when there are no assignments", async () => {
    vi.mocked(hbprAssignmentService.list).mockResolvedValue({ data: [] } as never);
    renderPage();
    expect(await screen.findByText("No assignments yet")).toBeInTheDocument();
  });

  it("shows an error card when the fetch fails", async () => {
    vi.mocked(hbprAssignmentService.list).mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByText("Failed to load assignments")).toBeInTheDocument();
  });

  it("renders the effective-to date for an ended assignment on the archive tab", async () => {
    vi.mocked(hbprAssignmentService.list).mockResolvedValue({
      data: [endedAssignment],
    } as never);
    renderPage();
    // The only row is ended, so the default Active tab is empty.
    expect(await screen.findByRole("tab", { name: "Active 0" })).toBeInTheDocument();
    expect(screen.queryByText("2026-06-30")).not.toBeInTheDocument();
    await openArchiveTab();
    expect(await screen.findByText("2026-06-30")).toBeInTheDocument();
  });

  it("keeps dates and status on one line so narrow columns never split them", async () => {
    vi.mocked(hbprAssignmentService.list).mockResolvedValue({
      data: [{ ...assignment, cadence_status: "not_started" as const }],
    } as never);
    renderPage();
    expect(await screen.findByText("2026-09-08")).toHaveClass("whitespace-nowrap");
    expect(screen.getByText("2026-01-01")).toHaveClass("whitespace-nowrap");
    expect(screen.getByText("Not started")).toHaveClass("whitespace-nowrap");
  });

  it("only offers End for a current assignment", async () => {
    vi.mocked(hbprAssignmentService.list).mockResolvedValue({
      data: [endedAssignment],
    } as never);
    renderPage();
    await openArchiveTab();
    await waitFor(() => expect(screen.getByText("Olsa Leader")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /end assignment/i })).not.toBeInTheDocument();
  });

  it("splits active and ended rows across the tabs with counts", async () => {
    vi.mocked(hbprAssignmentService.list).mockResolvedValue({
      data: [assignment, endedAssignment],
    } as never);
    renderPage();
    expect(await screen.findByRole("tab", { name: "Active 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Archive 1" })).toBeInTheDocument();
    // Default view: the active row only.
    expect(screen.getByText("Enri Leader")).toBeInTheDocument();
    expect(screen.queryByText("Olsa Leader")).not.toBeInTheDocument();
    await openArchiveTab();
    expect(await screen.findByText("Olsa Leader")).toBeInTheDocument();
    expect(screen.queryByText("Enri Leader")).not.toBeInTheDocument();
  });

  it("explains the 6-month purge on the archive tab", async () => {
    vi.mocked(hbprAssignmentService.list).mockResolvedValue({
      data: [endedAssignment],
    } as never);
    renderPage();
    await openArchiveTab();
    expect(await screen.findByText(/older than 6 months/i)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // evidence_count badge
  });
});
