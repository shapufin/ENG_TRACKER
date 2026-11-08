import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListView } from "./ListView";
import { MOBILE_CARD_QUERY } from "@/components/ui/DataTableCards";
import type { CalendarEvent } from "./types";

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

describe("ListView phone agenda", () => {
  const events = [
    {
      id: "a",
      title: "Standby",
      start: "2026-11-10",
      end: "2026-11-10",
      type: "standby",
      status: "approved",
      userId: 1,
      userName: "Alice",
      compactLabel: "Standby",
    },
    {
      id: "b",
      title: "Vacation",
      start: "2026-11-10",
      end: "2026-11-12",
      type: "vacation",
      status: "pending",
      userId: 2,
      userName: "Bob",
      compactLabel: "Vacation",
    },
    {
      id: "c",
      title: "Sick",
      start: "2026-11-14",
      end: "2026-11-14",
      type: "sick",
      status: "approved",
      userId: 1,
      userName: "Alice",
      compactLabel: "Sick",
    },
  ] as unknown as CalendarEvent[];

  afterEach(() => vi.unstubAllGlobals());

  it("groups events by day as an agenda instead of a table on phones", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === MOBILE_CARD_QUERY,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    render(<ListView events={events} users={[]} />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const days = screen.getAllByRole("heading", { level: 3 });
    expect(days).toHaveLength(2);
    expect(days[0]).toHaveTextContent("Tue, Nov 10");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });
});
