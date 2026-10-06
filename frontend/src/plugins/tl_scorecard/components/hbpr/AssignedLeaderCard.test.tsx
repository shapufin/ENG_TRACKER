import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AssignedLeaderCard } from "./AssignedLeaderCard";
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

describe("AssignedLeaderCard", () => {
  it("offers the leader-scoped evidence action like the desktop table", () => {
    render(
      <MemoryRouter>
        <AssignedLeaderCard leader={LEADER} year={2026} />
      </MemoryRouter>
    );

    const action = screen.getByRole("link", { name: /partnership log.*alba leader/i });
    expect(action).toHaveAttribute("href", "/hbpr?view=evidence&year=2026&leader=8");
  });
});
