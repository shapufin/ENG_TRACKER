import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("only offers End for a current assignment", async () => {
    vi.mocked(hbprAssignmentService.list).mockResolvedValue({
      data: [{ ...assignment, id: 2, is_current: false, effective_to: "2026-06-30" }],
    } as never);
    renderPage();
    await waitFor(() => expect(screen.getByText("Enri Leader")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: /end assignment/i })
    ).not.toBeInTheDocument();
  });
});
