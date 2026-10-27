import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TeamLifecycleDialog } from "./TeamLifecycleDialog";
import { ArchiveTeamDialog } from "./ArchiveTeamDialog";
import { userService } from "@/services/userService";
import type { Team, TeamLifecycle } from "@/types";

vi.mock("@/services/userService", () => ({
  userService: { getTeamLifecycle: vi.fn() },
}));

const team = {
  id: 7,
  name: "Old Team",
  code: "OLD",
  is_active: false,
  description: "",
  parent_team: null,
  team_leader: null,
  calendar_group: "",
  created_at: "",
  updated_at: "",
} as Team;

const lifecycle = (overrides: Partial<TeamLifecycle> = {}): TeamLifecycle => ({
  id: 7,
  is_active: false,
  archived_at: "2026-01-02T10:00:00Z",
  purge_eligible_at: "2027-01-02T10:00:00Z",
  last_activity: "2026-01-02T10:00:00Z",
  members_count: 0,
  archive_blockers: [],
  delete_blockers: [],
  purge_blockers: [],
  counts: {},
  cascade_counts: {},
  ...overrides,
});

const wrap = (node: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
};

describe("TeamLifecycleDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the dates and the records that block a delete", async () => {
    vi.mocked(userService.getTeamLifecycle).mockResolvedValue(
      lifecycle({
        counts: { engagement_metrics: 4, sub_teams: 1 },
        cascade_counts: { analytics_metrics: 9 },
        delete_blockers: ["Team still has records that must be kept: sub_teams (1)."],
      })
    );
    wrap(
      <TeamLifecycleDialog
        team={team}
        open
        onOpenChange={vi.fn()}
        onDelete={vi.fn()}
        isDeleting={false}
      />
    );
    expect(await screen.findByText("Engagement metrics")).toBeInTheDocument();
    expect(screen.getByText("Sub-teams")).toBeInTheDocument();
    expect(screen.getByText("Analytics metrics")).toBeInTheDocument();
    expect(screen.getByText("2027-01-02")).toBeInTheDocument();
    expect(screen.getByText(/sub_teams \(1\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete team" })).not.toBeInTheDocument();
  });

  it("offers delete only after typing the team code", async () => {
    vi.mocked(userService.getTeamLifecycle).mockResolvedValue(lifecycle());
    const onDelete = vi.fn();
    wrap(
      <TeamLifecycleDialog
        team={team}
        open
        onOpenChange={vi.fn()}
        onDelete={onDelete}
        isDeleting={false}
      />
    );
    const button = await screen.findByRole("button", { name: "Delete team" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type OLD to confirm/), { target: { value: "OLD" } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onDelete).toHaveBeenCalledWith(7);
  });
});

describe("ArchiveTeamDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("states how many members will be unassigned", async () => {
    vi.mocked(userService.getTeamLifecycle).mockResolvedValue(
      lifecycle({ is_active: true, members_count: 3 })
    );
    wrap(
      <ArchiveTeamDialog
        team={{ ...team, is_active: true }}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(await screen.findByText(/3 members will be unassigned/)).toBeInTheDocument();
  });

  it("keeps the confirm button disabled until the lifecycle read resolves", () => {
    vi.mocked(userService.getTeamLifecycle).mockReturnValue(new Promise<TeamLifecycle>(() => {}));
    wrap(
      <ArchiveTeamDialog
        team={{ ...team, is_active: true }}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /archive team/i })).toBeDisabled();
  });

  it("lists the reasons the server would refuse and blocks the confirm button", async () => {
    vi.mocked(userService.getTeamLifecycle).mockResolvedValue(
      lifecycle({
        is_active: true,
        archive_blockers: ["Team still has 1 active sub-team(s): archive or move them first."],
      })
    );
    const onConfirm = vi.fn();
    wrap(
      <ArchiveTeamDialog
        team={{ ...team, is_active: true }}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />
    );
    expect(await screen.findByText(/cannot be archived yet/)).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: /archive team/i });
    expect(confirm).toBeDisabled();
  });
});
