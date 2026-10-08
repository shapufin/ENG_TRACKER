import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HbprEvidenceKind } from "../../types/tlScorecard";
import { GroupedEvidenceList } from "./GroupedEvidenceList";

interface Row {
  id: number;
  kind: HbprEvidenceKind;
  occurred_on: string;
}

const row = (id: number, kind: HbprEvidenceKind, day = 1): Row => ({
  id,
  kind,
  occurred_on: `2026-03-${String(day).padStart(2, "0")}`,
});

const renderRow = (r: Row) => <span>{`row-${r.id}`}</span>;

describe("GroupedEvidenceList", () => {
  it("groups rows in cadence, mid-year, year-end order", () => {
    render(
      <GroupedEvidenceList
        rows={[row(1, "epr_year_end"), row(2, "cadence_meeting"), row(3, "epr_mid_year")]}
        renderRow={renderRow}
      />
    );
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      expect.stringContaining("Cadence meetings"),
      expect.stringContaining("Mid-year EPR"),
      expect.stringContaining("Year-end EPR"),
    ]);
  });

  it("shows an empty line for a kind with no rows", () => {
    render(<GroupedEvidenceList rows={[row(1, "cadence_meeting")]} renderRow={renderRow} />);
    const midYear = screen.getByRole("region", { name: /Mid-year EPR/ });
    expect(within(midYear).getByText("Nothing logged yet")).toBeInTheDocument();
  });

  it("lists each group's rows newest first", () => {
    render(
      <GroupedEvidenceList
        rows={[row(1, "cadence_meeting", 2), row(2, "cadence_meeting", 9)]}
        renderRow={renderRow}
      />
    );
    const group = screen.getByRole("region", { name: /Cadence meetings/ });
    expect(
      within(group)
        .getAllByText(/row-/)
        .map((n) => n.textContent)
    ).toEqual(["row-2", "row-1"]);
  });

  it("collapses a group over 6 rows and expands on Show all", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(i + 1, "cadence_meeting", i + 1));
    render(<GroupedEvidenceList rows={rows} renderRow={renderRow} />);
    expect(screen.getAllByText(/row-/)).toHaveLength(6);

    const toggle = screen.getByRole("button", { name: "Show all 8" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getAllByText(/row-/)).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Show fewer" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });
});
