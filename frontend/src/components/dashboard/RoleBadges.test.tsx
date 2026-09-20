import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleBadges } from "./RoleSwitcher";

describe("RoleBadges", () => {
  it("renders subtle tone pills instead of solid badge variants", () => {
    const { container } = render(
      <RoleBadges isTeamLeader isHR={false} isAdmin={false} isSuperuser={false} />
    );

    const pill = screen.getByText("Team Leader");
    expect(pill.className).toContain("border-tone-accent-border");
    expect(pill.className).toContain("bg-tone-accent-surface");
    // No solid fills — the old default/secondary/destructive Badge look.
    expect(container.innerHTML).not.toContain("bg-primary ");
    expect(container.innerHTML).not.toContain('bg-primary"');
    expect(container.innerHTML).not.toContain("bg-destructive");
    expect(container.innerHTML).not.toContain("bg-secondary");
  });

  it("maps HR to neutral and admin/superuser to danger tones", () => {
    render(<RoleBadges isTeamLeader={false} isHR isAdmin isSuperuser={false} />);

    expect(screen.getByText("HR").className).toContain("bg-tone-neutral-surface");
    expect(screen.getByText("Admin").className).toContain("bg-tone-danger-surface");
  });

  it("renders nothing when the user has no elevated role", () => {
    const { container } = render(
      <RoleBadges isTeamLeader={false} isHR={false} isAdmin={false} isSuperuser={false} />
    );

    expect(container.firstChild).toBeNull();
  });
});
