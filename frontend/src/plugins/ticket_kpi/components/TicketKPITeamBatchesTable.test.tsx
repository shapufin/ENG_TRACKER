import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TicketKPITeamBatchesTable } from "./TicketKPITeamBatchesTable";
import type { BatchRow } from "../pages/hooks/useTicketKPITeamManagement";

const open = {
  id: 1,
  user: 7,
  user_name: "alice",
  month: "2026-03-01",
  record_count: 12,
  is_reviewed: false,
  reviewed_by: null,
  reviewed_by_username: null,
} as unknown as BatchRow;
const mine = {
  ...open,
  id: 2,
  user_name: "bob",
  is_reviewed: true,
  reviewed_by: 5,
  reviewed_by_username: "lead",
} as unknown as BatchRow;
const adminLocked = {
  ...mine,
  id: 3,
  user_name: "cara",
  reviewed_by: 9,
  reviewed_by_username: "admin",
} as unknown as BatchRow;

const setup = (overrides: Partial<React.ComponentProps<typeof TicketKPITeamBatchesTable>> = {}) => {
  const props = {
    rows: [open, mine, adminLocked],
    isLoading: false,
    onDelete: vi.fn(),
    onReview: vi.fn(),
    onUnreview: vi.fn(),
    canUnreview: (b: BatchRow) => b.reviewed_by === 5,
    rowSelection: {},
    onRowSelectionChange: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <TicketKPITeamBatchesTable {...props} />
    </MemoryRouter>
  );
  return props;
};

describe("TicketKPITeamBatchesTable review actions", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offers Review on an open import and Undo review only where allowed", () => {
    setup();
    expect(screen.getByRole("button", { name: "Review upload for alice" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review upload for bob" })).toBeNull();
    expect(screen.getByRole("button", { name: "Undo review for bob" })).toBeTruthy();
    // reviewed by someone else: no way back from this view
    expect(screen.queryByRole("button", { name: "Undo review for cara" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Review upload for cara" })).toBeNull();
  });

  it("calls the handlers with the row's batch", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Review upload for alice" }));
    expect(props.onReview).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Undo review for bob" }));
    expect(props.onUnreview).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });
});
