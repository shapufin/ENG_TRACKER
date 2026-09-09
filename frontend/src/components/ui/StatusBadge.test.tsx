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

  // Text colour comes from the tone scale, which already carries the AA
  // light-mode (-700 range) and lighter dark-mode values — so no `dark:`
  // variant should appear at the callsite.
  it("uses tone tokens for text, with no dark: variant", () => {
    const { container: pending } = render(<StatusBadge variant="pending" />);
    const { container: approved } = render(<StatusBadge variant="approved" />);
    const { container: rejected } = render(<StatusBadge variant="rejected" />);
    expect(pending.firstElementChild?.className).toContain("text-tone-warning-text");
    expect(approved.firstElementChild?.className).toContain("text-tone-success-text");
    expect(rejected.firstElementChild?.className).toContain("text-tone-danger-text");
    for (const c of [pending, approved, rejected]) {
      expect(c.firstElementChild?.className).not.toContain("dark:");
    }
  });
});
