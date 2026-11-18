import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BreakdownSection, type BreakdownData } from "./BreakdownSection";

const data: BreakdownData = {
  has_data: true,
  by_status: { Done: 6, Open: 3, Parked: 1 },
  by_priority: { high: 4, low: 6 },
  by_category: { Network: 7, Email: 3 },
  clients: [
    { id: 1, name: "Acme" },
    { id: 2, name: "Beta" },
  ],
};

const baseProps = {
  data,
  group: null,
  clientId: null,
  onGroupChange: vi.fn(),
  onClientChange: vi.fn(),
};

describe("BreakdownSection", () => {
  it("shows every value as text with its count and share", () => {
    render(<BreakdownSection {...baseProps} />);
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getAllByText(/60%/).length).toBeGreaterThan(0);
  });

  it("toggles a status chip on and off", () => {
    const onGroupChange = vi.fn();
    const { rerender } = render(<BreakdownSection {...baseProps} onGroupChange={onGroupChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Closed" }));
    expect(onGroupChange).toHaveBeenLastCalledWith("closed");
    rerender(<BreakdownSection {...baseProps} group="closed" onGroupChange={onGroupChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Closed" }));
    expect(onGroupChange).toHaveBeenLastCalledWith(null);
  });

  it("offers client chips only when the month has more than one client", () => {
    const { rerender } = render(<BreakdownSection {...baseProps} />);
    expect(screen.getByRole("button", { name: "Acme" })).toBeInTheDocument();
    rerender(<BreakdownSection {...baseProps} data={{ ...data, clients: [data.clients[0]] }} />);
    expect(screen.queryByRole("button", { name: "Acme" })).not.toBeInTheDocument();
  });

  it("says the totals are unaffected once a filter is on", () => {
    render(<BreakdownSection {...baseProps} group="open" />);
    expect(screen.getByText(/totals above still cover the whole month/)).toBeInTheDocument();
  });

  it("shows an empty message when a filter matches nothing", () => {
    render(
      <BreakdownSection
        {...baseProps}
        group="cancelled"
        data={{ ...data, by_status: {}, by_priority: {}, by_category: {} }}
      />
    );
    expect(screen.getAllByText("No tickets with this filter.")).toHaveLength(3);
  });
});
