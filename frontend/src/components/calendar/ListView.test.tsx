import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListView } from "./ListView";

vi.mock("./ListViewHeader", () => ({
  ListViewHeader: () => <div data-testid="list-header" />,
}));
vi.mock("./ListViewRow", () => ({
  ListViewRow: () => <tr data-testid="list-row" />,
}));
vi.mock("./ListViewEmptyState", () => ({
  ListViewEmptyState: () => <div data-testid="empty-state" />,
}));

describe("ListView mobile responsiveness", () => {
  it("does not force a fixed 720px min-width on the table for mobile", () => {
    render(<ListView events={[]} users={[]} />);

    const table = screen.getByRole("table");
    expect(table.className).not.toMatch(/(^|\s)min-w-\[720px\]/);
    expect(table.className).toContain("md:min-w-[720px]");
  });
});
