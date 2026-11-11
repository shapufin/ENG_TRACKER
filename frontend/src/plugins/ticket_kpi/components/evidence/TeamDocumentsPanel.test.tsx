import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamDocumentsPanel } from "./TeamDocumentsPanel";
import * as hook from "../../pages/hooks/useTicketKPIEvidence";
import type { KPIEvidence } from "../../types/ticketKPI";

vi.mock("../../pages/hooks/useTicketKPIEvidence");
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 } }) }));

const doc = (id: number, user: number, username: string, status: KPIEvidence["status"]) =>
  ({
    id,
    user,
    username,
    month: "2026-03-01",
    clients: [],
    evidence_type: "document",
    description: `Doc ${id}`,
    status,
    created_at: "2026-03-02T10:00:00Z",
    updated_at: "2026-03-02T10:00:00Z",
  }) as KPIEvidence;

const review = vi.fn();
const mutation = { mutate: vi.fn(), isPending: false, variables: undefined };

const mockHook = (evidence: KPIEvidence[], isLoading = false) =>
  vi.mocked(hook.useTicketKPIEvidence).mockReturnValue({
    evidence,
    isLoading,
    canReview: true,
    reviewMutation: { ...mutation, mutate: review },
    unreviewMutation: mutation,
    deleteMutation: mutation,
  } as never);

describe("TeamDocumentsPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks the hook for the whole squad, not one user", () => {
    mockHook([]);
    render(<TeamDocumentsPanel month="2026-03-01" />);
    expect(hook.useTicketKPIEvidence).toHaveBeenCalledWith({ month: "2026-03-01", squad: true });
  });

  it("shows an empty state when the squad added nothing", () => {
    mockHook([]);
    render(<TeamDocumentsPanel month="2026-03-01" />);
    expect(screen.getByText("No documents from your team this month.")).toBeInTheDocument();
  });

  it("filters by status and keeps the pending count in step with the list", () => {
    mockHook([
      doc(1, 2, "ana", "pending"),
      doc(2, 3, "ben", "approved"),
      doc(3, 3, "ben", "pending"),
    ]);
    render(<TeamDocumentsPanel month="2026-03-01" />);
    expect(screen.getByRole("button", { name: /^pending\s*2$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^pending\s*\d+$/i }));
    expect(screen.getAllByText(/Doc \d/)).toHaveLength(2);
    expect(screen.queryByText("Doc 2")).not.toBeInTheDocument();
  });

  it("lets the Line Manager approve a member's document", () => {
    mockHook([doc(1, 2, "ana", "pending")]);
    render(<TeamDocumentsPanel month="2026-03-01" />);
    fireEvent.click(screen.getByLabelText("Approve document"));
    expect(review).toHaveBeenCalledWith({ id: 1, status: "approved" });
  });
});
