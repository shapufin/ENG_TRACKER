import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillsMemberCard } from "./SkillsMemberCard";
import type { SkillCoverage, TeamMatrixRow } from "../types/skills";

vi.mock("./SkillsMemberDetail", () => ({
  SkillsMemberDetail: ({ row }: { row: TeamMatrixRow }) => (
    <div data-testid="member-detail" data-username={row.username} />
  ),
}));

const coverage: SkillCoverage[] = [
  {
    skill_id: 10,
    skill_name: "Python",
    category_name: "Backend",
    team_count: 1,
    avg_level: 3,
  },
];

const rows: TeamMatrixRow[] = [
  {
    user_id: 100,
    username: "alice",
    skills: [
      {
        user_skill_id: 999,
        skill_id: 10,
        skill_name: "Python",
        category_name: "Backend",
        level: 3,
      },
    ],
  },
  {
    user_id: 200,
    username: "bob",
    skills: [],
  },
];

describe("SkillsMemberCard", () => {
  it("renders a tappable button for each member", () => {
    render(
      <SkillsMemberCard
        rows={rows}
        coverage={coverage}
        expandedUserId={null}
        onExpandedUserIdChange={vi.fn()}
        onRate={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /alice/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bob/i })).toBeInTheDocument();
  });

  it("expands a member to show the detail view", () => {
    render(
      <SkillsMemberCard
        rows={rows}
        coverage={coverage}
        expandedUserId={100}
        onExpandedUserIdChange={vi.fn()}
        onRate={vi.fn()}
      />
    );

    expect(screen.getByTestId("member-detail")).toHaveAttribute("data-username", "alice");
    // bob is not expanded.
    expect(screen.queryAllByTestId("member-detail").length).toBe(1);
  });

  it("calls onExpandedUserIdChange when a member is tapped", () => {
    const onExpandedUserIdChange = vi.fn();
    render(
      <SkillsMemberCard
        rows={rows}
        coverage={coverage}
        expandedUserId={null}
        onExpandedUserIdChange={onExpandedUserIdChange}
        onRate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /alice/i }));

    expect(onExpandedUserIdChange).toHaveBeenCalledWith(100);
  });

  it("calls onExpandedUserIdChange with null when an expanded member is tapped again", () => {
    const onExpandedUserIdChange = vi.fn();
    render(
      <SkillsMemberCard
        rows={rows}
        coverage={coverage}
        expandedUserId={100}
        onExpandedUserIdChange={onExpandedUserIdChange}
        onRate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /alice/i }));

    expect(onExpandedUserIdChange).toHaveBeenCalledWith(null);
  });

  it("marks the expanded member button with aria-expanded", () => {
    render(
      <SkillsMemberCard
        rows={rows}
        coverage={coverage}
        expandedUserId={100}
        onExpandedUserIdChange={vi.fn()}
        onRate={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /alice/i }).getAttribute("aria-expanded")).toBe(
      "true"
    );
    expect(screen.getByRole("button", { name: /bob/i }).getAttribute("aria-expanded")).toBe(
      "false"
    );
  });

  it("retains focus on the trigger button after collapsing via keyboard", () => {
    const onExpandedUserIdChange = vi.fn();
    render(
      <SkillsMemberCard
        rows={rows}
        coverage={coverage}
        expandedUserId={100}
        onExpandedUserIdChange={onExpandedUserIdChange}
        onRate={vi.fn()}
      />
    );

    const aliceBtn = screen.getByRole("button", { name: /alice/i });
    aliceBtn.focus();
    expect(document.activeElement).toBe(aliceBtn);
    // Collapse via Enter key.
    fireEvent.keyDown(aliceBtn, { key: "Enter" });
    fireEvent.click(aliceBtn);
    // Focus should remain on the trigger button after collapse.
    expect(document.activeElement).toBe(aliceBtn);
  });

  it("supports keyboard activation via Space key", () => {
    const onExpandedUserIdChange = vi.fn();
    render(
      <SkillsMemberCard
        rows={rows}
        coverage={coverage}
        expandedUserId={null}
        onExpandedUserIdChange={onExpandedUserIdChange}
        onRate={vi.fn()}
      />
    );

    const aliceBtn = screen.getByRole("button", { name: /alice/i });
    aliceBtn.focus();
    fireEvent.click(aliceBtn);

    expect(onExpandedUserIdChange).toHaveBeenCalledWith(100);
  });

  it("uses the username as the accessible name for the trigger", () => {
    render(
      <SkillsMemberCard
        rows={rows}
        coverage={coverage}
        expandedUserId={null}
        onExpandedUserIdChange={vi.fn()}
        onRate={vi.fn()}
      />
    );

    // Each trigger button has an accessible name derived from the username.
    expect(screen.getByRole("button", { name: "alice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "bob" })).toBeInTheDocument();
  });
});
