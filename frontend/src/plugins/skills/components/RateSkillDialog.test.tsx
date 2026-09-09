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

describe("RateSkillDialog", () => {
  it("renders five level buttons and current-level context when open", () => {
    render(
      <RateSkillDialog target={target} isPending={false} onSubmit={vi.fn()} onClose={vi.fn()} />
    );

    expect(screen.getByText("Rate Skill")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "L1 Foundational" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "L2 Developing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "L3 Proficient" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "L4 Advanced" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "L5 Mastery" })).toBeInTheDocument();
    expect(screen.getByText(/Currently rated/i)).toBeInTheDocument();
    expect(screen.getByText(/L3 — Proficient/i)).toBeInTheDocument();
  });

  it("marks the current level as pressed", () => {
    render(
      <RateSkillDialog target={target} isPending={false} onSubmit={vi.fn()} onClose={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: "L3 Proficient" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByRole("button", { name: "L4 Advanced" }).getAttribute("aria-pressed")).toBe(
      "false"
    );
  });

  it("calls onSubmit with the selected level", () => {
    const onSubmit = vi.fn();
    render(
      <RateSkillDialog target={target} isPending={false} onSubmit={onSubmit} onClose={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: "L4 Advanced" }));

    expect(onSubmit).toHaveBeenCalledWith(4);
  });

  it("disables level buttons while a rating is pending", () => {
    render(
      <RateSkillDialog target={target} isPending={true} onSubmit={vi.fn()} onClose={vi.fn()} />
    );

    for (const level of [
      "L1 Foundational",
      "L2 Developing",
      "L3 Proficient",
      "L4 Advanced",
      "L5 Mastery",
    ]) {
      expect(screen.getByRole("button", { name: level })).toBeDisabled();
    }
  });

  it("renders nothing when there is no target", () => {
    render(
      <RateSkillDialog target={null} isPending={false} onSubmit={vi.fn()} onClose={vi.fn()} />
    );

    expect(screen.queryByText("Rate Skill")).not.toBeInTheDocument();
  });

  it("renders current level as a styled badge using levelColor", () => {
    render(
      <RateSkillDialog target={target} isPending={false} onSubmit={vi.fn()} onClose={vi.fn()} />
    );
    const badge = screen.getByText(/L3 — Proficient/i);
    expect(badge.tagName.toLowerCase()).toBe("span");
    expect(badge.className).toContain("bg-amber-500");
  });

  it("shows the +1 quick action submitting currentLevel + 1", () => {
    const onSubmit = vi.fn();
    render(
      <RateSkillDialog target={target} isPending={false} onSubmit={onSubmit} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: /increase to l4/i }));
    expect(onSubmit).toHaveBeenCalledWith(4);
  });

  it("hides the +1 quick action at L5 (cannot increment)", () => {
    render(
      <RateSkillDialog
        target={{ ...target, currentLevel: 5 }}
        isPending={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /increase to/i })).not.toBeInTheDocument();
  });

  it("disables the +1 quick action while pending", () => {
    render(
      <RateSkillDialog target={target} isPending={true} onSubmit={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /increase to l4/i })).toBeDisabled();
  });
});
