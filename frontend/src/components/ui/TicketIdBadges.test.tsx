import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TicketIdBadges } from "./TicketIdBadges";

describe("TicketIdBadges", () => {
  it("renders a hyphen when references is undefined or empty", () => {
    const { container: empty } = render(<TicketIdBadges references={[]} />);
    expect(empty.textContent).toBe("-");

    const { container: missing } = render(<TicketIdBadges references={undefined} />);
    expect(missing.textContent).toBe("-");
  });

  it("renders a single outline badge for one ticket", () => {
    render(<TicketIdBadges references={["INC-101"]} />);
    const badge = screen.getByText("INC-101");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "INC-101");
  });

  it("renders two badges for two tickets", () => {
    render(<TicketIdBadges references={["INC-101", "INC-102"]} />);
    expect(screen.getByText("INC-101")).toBeInTheDocument();
    expect(screen.getByText("INC-102")).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("renders first two badges plus overflow badge for 3+ tickets", () => {
    render(<TicketIdBadges references={["INC-101", "INC-102", "INC-103", "INC-104", "INC-105"]} />);
    expect(screen.getByText("INC-101")).toBeInTheDocument();
    expect(screen.getByText("INC-102")).toBeInTheDocument();
    expect(screen.queryByText("INC-103")).not.toBeInTheDocument();

    const overflow = screen.getByText("+3");
    expect(overflow).toBeInTheDocument();
    expect(overflow).toHaveAttribute("title", "3 more: INC-103, INC-104, INC-105");
  });

  it("respects custom maxVisible", () => {
    render(<TicketIdBadges references={["A", "B", "C"]} maxVisible={1} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });
});
