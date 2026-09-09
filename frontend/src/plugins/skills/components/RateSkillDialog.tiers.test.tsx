import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RateSkillDialog } from "./RateSkillDialog";
import type { SkillRateTarget } from "./SkillsMemberList";

const target: SkillRateTarget = {
  userSkillId: 999,
  username: "alice",
  skillName: "Python",
  currentLevel: 3,
};

const renderOpen = (onSubmit = vi.fn()) =>
  render(
    <RateSkillDialog target={target} isPending={false} onSubmit={onSubmit} onClose={vi.fn()} />
  );

describe("RateSkillDialog tiers (mockup SkillRating pattern)", () => {
  it("groups five tiers under a labelled group", () => {
    renderOpen();
    expect(screen.getByRole("group", { name: "Select new level" })).toBeInTheDocument();
  });

  it("shows every tier with its visible level name", () => {
    renderOpen();
    for (const name of [
      "L1 Foundational",
      "L2 Developing",
      "L3 Proficient",
      "L4 Advanced",
      "L5 Mastery",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("marks only the current tier as pressed and submits the clicked tier", () => {
    const onSubmit = vi.fn();
    renderOpen(onSubmit);
    expect(screen.getByRole("button", { name: "L3 Proficient" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "L2 Developing" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    fireEvent.click(screen.getByRole("button", { name: "L4 Advanced" }));
    expect(onSubmit).toHaveBeenCalledWith(4);
  });

  it("tiers are native buttons (keyboard operable)", () => {
    renderOpen();
    for (const name of ["L1 Foundational", "L5 Mastery"]) {
      const btn = screen.getByRole("button", { name });
      expect(btn.tagName.toLowerCase()).toBe("button");
      expect(btn).toBeEnabled();
    }
  });
});
