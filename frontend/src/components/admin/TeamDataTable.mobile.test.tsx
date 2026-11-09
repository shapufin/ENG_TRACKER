import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TeamDataTable } from "./TeamDataTable";
import { MOBILE_CARD_QUERY } from "@/components/ui/DataTableCards";
import type { TeamNode } from "@/lib/teamTree";

const stubPhone = () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query === MOBILE_CARD_QUERY,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
};

const team = {
  id: 1,
  name: "Alpha",
  code: "ALP",
  description: "",
  italian_tl: { id: 7, username: "it", first_name: "Ida", last_name: "Rossi" },
  albanian_tl: null,
  calendar_group: "North",
  members_count: 4,
  sub_teams_count: 0,
  is_active: true,
  depth: 0,
  children: [],
} as unknown as TeamNode;

describe("TeamDataTable phone cards", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows each team as a card with its leaders and the same row actions", () => {
    localStorage.clear();
    stubPhone();
    render(
      <TeamDataTable
        data={[team]}
        expanded={new Set()}
        onToggleExpand={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onArchive={vi.fn()}
        hoveredPath={new Set()}
        onRowMouseEnter={vi.fn()}
        onRowMouseLeave={vi.fn()}
      />
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const card = screen.getByRole("listitem");
    expect(within(card).getByText("Alpha")).toBeInTheDocument();
    expect(within(card).getByText("Ida Rossi")).toBeInTheDocument();
    expect(within(card).getByText("North")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Edit Alpha" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Archive Alpha" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Delete Alpha" })).toBeInTheDocument();
  });
});
