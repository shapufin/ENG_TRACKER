import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TicketKPITeamBatchesTable } from "./TicketKPITeamBatchesTable";
import { TicketKPIRecentUploads } from "./TicketKPIRecentUploads";

const ROW = {
  user: 1,
  user_name: "enri.demnushi",
  month: "2026-05-01",
  profile: 1,
  profile_name: "ServiceNow Default",
  record_count: 124,
  created_at: "2026-06-29T12:00:00Z",
} as any;

beforeEach(() => {
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

describe("ticket KPI upload dates", () => {
  it("renders batch Uploaded dates as DD/MM/YYYY, not locale M/D/YYYY", () => {
    render(
      <MemoryRouter>
        <TicketKPITeamBatchesTable rows={[ROW]} isLoading={false} onDelete={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText("29/06/2026")).toBeInTheDocument();
    expect(screen.queryByText("6/29/2026")).not.toBeInTheDocument();
  });

  it("renders recent-upload dates as DD/MM/YYYY, not locale M/D/YYYY", () => {
    render(<TicketKPIRecentUploads batches={[{ ...ROW, id: 7 }]} />);
    expect(screen.getByText("29/06/2026")).toBeInTheDocument();
    expect(screen.queryByText("6/29/2026")).not.toBeInTheDocument();
  });
});
