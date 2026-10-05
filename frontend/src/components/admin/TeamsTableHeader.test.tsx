import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TeamsTableHeader } from "./TeamsTableHeader";

describe("TeamsTableHeader", () => {
  it("sources its header from the shared table contract", () => {
    const { container } = render(<TeamsTableHeader allSelected={false} onSelectAll={vi.fn()} />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain("text-foreground");
    expect(row.className).toContain("font-medium");
    expect(row.className).toContain("border-b");
    expect(row.className).not.toContain("uppercase");
    expect(row.className).not.toMatch(/tracking-/);
    expect(screen.getByText("Calendar Group")).toBeInTheDocument();
  });
});
