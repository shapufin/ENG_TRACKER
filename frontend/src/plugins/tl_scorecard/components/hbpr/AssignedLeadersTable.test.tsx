import React from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AssignedLeadersTable } from "./AssignedLeadersTable";
import type { HbprLeaderRow } from "../../types/tlScorecard";

const LEADER = {
  id: 8,
  name: "Alba Leader",
  assignment_id: 11,
  cadence: "weekly",
  team_size: 4,
  last_meeting_on: null,
  next_due_on: "2026-10-11",
  cadence_status: "on_track",
  epr_mid_year: false,
  epr_year_end: false,
  evidence_count: 0,
  last_evidence_on: null,
} as HbprLeaderRow;

const renderTable = (leaders: HbprLeaderRow[], year = 2026) =>
  render(
    <MemoryRouter>
      <AssignedLeadersTable leaders={leaders} year={year} />
    </MemoryRouter>
  );

describe("AssignedLeadersTable", () => {
  it("offers the leader-scoped evidence action on the table and the mobile card", () => {
    renderTable([LEADER]);

    const expectedHref = "/hbpr?view=evidence&year=2026&leader=8";
    expect(
      within(screen.getByRole("table")).getByRole("link", { name: /evidence.*alba leader/i })
    ).toHaveAttribute("href", expectedHref);
    expect(
      within(screen.getByRole("list")).getByRole("link", { name: /evidence.*alba leader/i })
    ).toHaveAttribute("href", expectedHref);
  });

  it("scopes the evidence action to the reporting year it was given", () => {
    renderTable([LEADER], 2025);

    expect(screen.getAllByRole("link", { name: /evidence.*alba leader/i })[0]).toHaveAttribute(
      "href",
      "/hbpr?view=evidence&year=2025&leader=8"
    );
  });

  it("shows the empty state and no table when no leaders are assigned", () => {
    renderTable([]);

    expect(screen.getByText(/no albanian team leaders assigned/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("sources its header from the shared table contract", () => {
    renderTable([LEADER]);

    const ths = [...screen.getByRole("table").querySelectorAll("thead th")];
    expect(ths).toHaveLength(8);
    for (const th of ths) {
      // Derived from TABLE_HEAD_CELL_CLASS with a tighter padding (this table is
      // denser), so assert the contract's typography survives rather than exact
      // string equality.
      expect(th.className).toContain("text-foreground");
      expect(th.className).toContain("font-medium");
      expect(th.className).not.toContain("uppercase");
      expect(th.className).not.toContain("tracking-wider");
    }
    expect(ths[7].className).toContain("text-right");
  });
});
