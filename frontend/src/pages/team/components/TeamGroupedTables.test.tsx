import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
