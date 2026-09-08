import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders approved status", () => {
    render(<StatusBadge variant="approved" />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("renders pending status", () => {
    render(<StatusBadge variant="pending" />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders rejected status", () => {
    render(<StatusBadge variant="rejected" />);
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("uses AA light-mode text (-700) with semantic token dark text", () => {
    const { container: pending } = render(<StatusBadge variant="pending" />);
    const { container: approved } = render(<StatusBadge variant="approved" />);
    const { container: rejected } = render(<StatusBadge variant="rejected" />);
    expect(pending.firstElementChild?.className).toContain("text-amber-700 dark:text-warning");
    expect(approved.firstElementChild?.className).toContain("text-emerald-700 dark:text-success");
    expect(rejected.firstElementChild?.className).toContain("text-rose-700 dark:text-destructive");
  });
});
