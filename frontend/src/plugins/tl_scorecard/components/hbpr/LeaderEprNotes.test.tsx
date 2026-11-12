import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LeaderEprNotes } from "./LeaderEprNotes";
import type { HbprLeaderRow } from "../../types/tlScorecard";

const LEADER = {
  id: 8,
  name: "Alba Leader",
  epr_stages: [
    {
      id: 1,
      employee_id: 3,
      employee_name: "Ben Member",
      stage: "mid_year",
      recorded_on: "2026-06-30T10:00:00Z",
      recorded_by_name: "Alba Leader",
      has_reference: true,
      shared_with_employee: false,
      hbpr_present: true,
    },
  ],
} as HbprLeaderRow;

describe("LeaderEprNotes", () => {
  it("opens from the name button and shows existence only", async () => {
    render(<LeaderEprNotes leader={LEADER} year={2026} />);
    // A native button: Enter/Space fire click, so no custom key handler is needed.
    fireEvent.click(screen.getByRole("button", { name: "Alba Leader" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Ben Member: Mid-year/)).toBeInTheDocument();
    expect(screen.getByText("Link attached")).toBeInTheDocument();
    expect(screen.getByText("Not shared")).toBeInTheDocument();
  });

  it("says so when no note exists", async () => {
    render(<LeaderEprNotes leader={{ ...LEADER, epr_stages: [] }} year={2026} />);
    fireEvent.click(screen.getByRole("button", { name: "Alba Leader" }));
    expect(await screen.findByText(/No EPR stage notes recorded for 2026/)).toBeInTheDocument();
  });
});
