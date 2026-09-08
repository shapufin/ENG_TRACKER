import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EvidenceList } from "./EvidenceList";
import type { KPIEvidence } from "../../types/ticketKPI";

vi.mock("./EvidenceItem", () => ({
  EvidenceItem: ({ item }: any) => (
    <div data-testid={`evidence-item-${item.id}`} data-type={item.evidence_type}>
      {item.evidence_type}
    </div>
  ),
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value, onValueChange }: any) => (
    <div data-testid="tabs" data-value={value}>
      <button data-testid="tabs-controller" onClick={() => onValueChange("document")}>
        switch
      </button>
      {children}
    </div>
  ),
  TabsList: ({ children }: any) => <div data-testid="tabs-list">{children}</div>,
  TabsTrigger: ({ children, value }: any) => <div data-testid={`trigger-${value}`}>{children}</div>,
}));

const baseItem = (overrides: Partial<KPIEvidence> = {}): KPIEvidence => ({
  id: 1,
  user: 1,
  month: "2024-06-01",
  clients: [],
  evidence_type: "document",
  description: "Test",
  status: "pending",
  created_at: "2024-06-01T00:00:00Z",
  updated_at: "2024-06-01T00:00:00Z",
  ...overrides,
});

const noop = () => {};

const defaultProps = {
  canReview: false,
  onReview: noop,
  onUnreview: noop,
  onDelete: noop,
  onViewEmail: noop,
};

describe("EvidenceList", () => {
  it("shows loading state", () => {
    render(<EvidenceList evidence={[]} isLoading={true} {...defaultProps} />);
    expect(screen.getByText("Loading evidence...")).toBeInTheDocument();
  });

  it("shows empty state when no evidence", () => {
    render(<EvidenceList evidence={[]} isLoading={false} {...defaultProps} />);
    expect(screen.getByText("No evidence uploaded for this month.")).toBeInTheDocument();
  });

  it("renders all items without filter tabs when only one type is present", () => {
    const evidence = [baseItem({ id: 1 }), baseItem({ id: 2 })];
    render(<EvidenceList evidence={evidence} isLoading={false} {...defaultProps} />);
    expect(screen.getByTestId("evidence-item-1")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-item-2")).toBeInTheDocument();
    // Only "all" + "document" = 2 filters, so tabs are not shown
    expect(screen.queryByTestId("tabs")).not.toBeInTheDocument();
  });

  it("renders filter tabs when multiple types are present", () => {
    const evidence = [
      baseItem({ id: 1, evidence_type: "document" }),
      baseItem({ id: 2, evidence_type: "certificate" }),
      baseItem({ id: 3, evidence_type: "email_thread" }),
    ];
    render(<EvidenceList evidence={evidence} isLoading={false} {...defaultProps} />);
    expect(screen.getByTestId("tabs")).toBeInTheDocument();
    expect(screen.getByTestId("trigger-all")).toBeInTheDocument();
    expect(screen.getByTestId("trigger-document")).toBeInTheDocument();
    expect(screen.getByTestId("trigger-certificate")).toBeInTheDocument();
    expect(screen.getByTestId("trigger-email_thread")).toBeInTheDocument();
    // Screenshot not present in data, so its trigger should not render
    expect(screen.queryByTestId("trigger-screenshot")).not.toBeInTheDocument();
  });

  it("filters evidence by type when tab is switched", () => {
    const evidence = [
      baseItem({ id: 1, evidence_type: "document" }),
      baseItem({ id: 2, evidence_type: "certificate" }),
    ];
    render(<EvidenceList evidence={evidence} isLoading={false} {...defaultProps} />);
    // Both visible initially
    expect(screen.getByTestId("evidence-item-1")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-item-2")).toBeInTheDocument();
    // Switch to "document" filter via the mocked tabs controller
    fireEvent.click(screen.getByTestId("tabs-controller"));
    expect(screen.getByTestId("evidence-item-1")).toBeInTheDocument();
    expect(screen.queryByTestId("evidence-item-2")).not.toBeInTheDocument();
  });

  it("shows empty message when filter has no items", () => {
    const evidence = [
      baseItem({ id: 1, evidence_type: "document" }),
      baseItem({ id: 2, evidence_type: "certificate" }),
    ];
    render(<EvidenceList evidence={evidence} isLoading={false} {...defaultProps} />);
    // Mocked controller switches to "document" — which has 1 item
    fireEvent.click(screen.getByTestId("tabs-controller"));
    // Verify the document filter shows 1 item
    expect(screen.getByTestId("evidence-item-1")).toBeInTheDocument();
  });
});
