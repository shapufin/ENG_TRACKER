import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TeamGroupedTables } from "./TeamGroupedTables";
import { MOBILE_CARD_QUERY } from "@/components/ui/DataTableCards";
import type { AppColumnDef } from "@/components/ui/tableTypes";

describe("TeamGroupedTables", () => {
  it("shows an icon-centered empty state when there are no rows", () => {
    const { container } = render(
      <TeamGroupedTables
        rows={[]}
        columnsBuilder={() => []}
        emptyCopy="No overtime entries match your filters."
        memberGroupMode="none"
        userMetaMap={new Map()}
      />
    );

    expect(screen.getByText("No overtime entries match your filters.")).toBeInTheDocument();

    // Icon-centered EmptyState: decorative icon hidden from assistive tech.
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  describe("phone cards", () => {
    type Row = { id: number; user: number; user_name: string; hours: number };
    const columns: AppColumnDef<Row>[] = [
      { accessorKey: "user_name", header: "Employee" },
      { accessorKey: "hours", header: "Hours" },
    ];
    const rows: Row[] = [{ id: 1, user: 7, user_name: "alice", hours: 2 }];

    afterEach(() => vi.unstubAllGlobals());

    it("passes mobileCard through to ungrouped and grouped tables", () => {
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

      for (const mode of ["none", "team"] as const) {
        const { unmount } = render(
          <TeamGroupedTables
            rows={rows}
            columnsBuilder={() => columns}
            emptyCopy="none"
            memberGroupMode={mode}
            userMetaMap={new Map()}
            mobileCard={{ title: "user_name", hero: "hours" }}
          />
        );
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(screen.getAllByRole("listitem")).toHaveLength(1);
        unmount();
      }
    });
  });

  describe("column visibility", () => {
    type Row = { id: number; user: number; user_name: string; hours: number; team_name: string };
    const columns: AppColumnDef<Row>[] = [
      { accessorKey: "user_name", header: "Employee" },
      { accessorKey: "hours", header: "Hours" },
    ];
    const rows: Row[] = [
      { id: 1, user: 7, user_name: "Alice", hours: 2, team_name: "Alpha" },
      { id: 2, user: 8, user_name: "Bob", hours: 4, team_name: "Beta" },
    ];

    beforeEach(() => {
      vi.stubGlobal(
        "ResizeObserver",
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
        }
      );
      localStorage.clear();
    });

    afterEach(() => {
      localStorage.clear();
      vi.unstubAllGlobals();
    });

    it("renders the Columns menu in ungrouped mode and persists selection", () => {
      render(
        <TeamGroupedTables
          rows={rows}
          columnsBuilder={() => columns}
          emptyCopy="none"
          memberGroupMode="none"
          userMetaMap={new Map()}
          enableColumnVisibility
          storageKey="test-team-overview-ungrouped"
        />
      );

      expect(screen.getAllByRole("columnheader", { name: /Hours/i })).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: /Columns \(2\/2\)/i }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Hours" }));

      expect(screen.queryByRole("columnheader", { name: /Hours/i })).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem("test-team-overview-ungrouped")!)).toEqual({
        _version: 1,
        hours: false,
      });
    });

    it("syncs toggled column visibility across all grouped tables", () => {
      render(
        <TeamGroupedTables
          rows={rows}
          columnsBuilder={() => columns}
          emptyCopy="none"
          memberGroupMode="team"
          userMetaMap={new Map()}
          enableColumnVisibility
          storageKey="test-team-overview-grouped"
        />
      );

      // Two groups (Alpha and Beta) -> two Hours headers initially.
      expect(screen.getAllByRole("columnheader", { name: /Hours/i })).toHaveLength(2);

      // Toggle Hours off from the first group's Columns menu.
      fireEvent.click(screen.getAllByRole("button", { name: /Columns \(2\/2\)/i })[0]);
      fireEvent.click(screen.getByRole("checkbox", { name: "Hours" }));

      // Both group tables hide Hours immediately.
      expect(screen.queryAllByRole("columnheader", { name: /Hours/i })).toHaveLength(0);
    });
  });
});
