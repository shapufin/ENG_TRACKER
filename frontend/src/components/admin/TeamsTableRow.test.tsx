import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TeamsTableRow } from "./TeamsTableRow";
import type { Team } from "@/types";

const team: Team = {
  id: 7,
  name: "E2E Test Team",
  code: "E2E",
  description: "",
  parent_team: null,
  team_leader: null,
  calendar_group: "",
  created_at: "",
  updated_at: "",
};

// Browser probe (dark): avatar initials at 3.09:1 FAIL. Initials use
// text-foreground on the tinted chip.
describe("TeamsTableRow text contrast", () => {
  it("avatar initials use text-foreground, not text-primary", () => {
    render(
      <MemoryRouter>
        <TeamsTableRow team={team} isSelected={false} onSelect={vi.fn()} onEdit={vi.fn()} />
      </MemoryRouter>
    );
    const chip = screen.getByText("ET");
    expect(chip.className).toContain("text-foreground");
    expect(chip.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });
});

describe("TeamsTableRow selection checkbox", () => {
  it("has an accessible name naming the team", () => {
    // Audit 2026-09-07: the row checkbox rendered as a bare "checkbox" —
    // screen-reader users had no way to tell which team it selects.
    render(
      <MemoryRouter>
        <TeamsTableRow team={team} isSelected={false} onSelect={vi.fn()} onEdit={vi.fn()} />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("checkbox", { name: /select team e2e test team/i })
    ).toBeInTheDocument();
  });
});
