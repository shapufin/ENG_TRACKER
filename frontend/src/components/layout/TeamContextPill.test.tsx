import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamContextPill } from "./TeamContextPill";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/context/PermissionContext", () => ({ usePermissions: vi.fn() }));

describe("TeamContextPill", () => {
  it("renders the team name and code for team leaders with a team", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { teams: [{ id: 1, name: "INFRA_SIAE", code: "SIAE" }] },
    } as never);
    vi.mocked(usePermissions).mockReturnValue({ isTeamLeader: true } as never);

    render(<TeamContextPill />);

    expect(screen.getByLabelText("Team context")).toBeInTheDocument();
    expect(screen.getByText("INFRA_SIAE")).toBeInTheDocument();
    expect(screen.getByText("SIAE")).toBeInTheDocument();
  });

  it("renders nothing for non-team-leaders", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { teams: [{ id: 1, name: "INFRA_SIAE", code: "SIAE" }] },
    } as never);
    vi.mocked(usePermissions).mockReturnValue({ isTeamLeader: false } as never);

    const { container } = render(<TeamContextPill />);

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the user has no team", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { teams: [] } } as never);
    vi.mocked(usePermissions).mockReturnValue({ isTeamLeader: true } as never);

    const { container } = render(<TeamContextPill />);

    expect(container.firstChild).toBeNull();
  });
});
