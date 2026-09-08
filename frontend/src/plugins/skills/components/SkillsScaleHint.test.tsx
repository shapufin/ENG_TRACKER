import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillsScaleHint } from "./SkillsScaleHint";
import type { SkillsViewMode } from "../types/skills";

const baseProps = {
  skillCount: 31,
  viewMode: "matrix" as SkillsViewMode,
  isMobile: false,
};

describe("SkillsScaleHint", () => {
  it("renders the hint when skillCount > 30, viewMode is matrix, and not mobile", () => {
    render(<SkillsScaleHint {...baseProps} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/30\+ skills visible/i)).toBeInTheDocument();
  });

  it("does NOT render the hint when skillCount < 30", () => {
    render(<SkillsScaleHint {...baseProps} skillCount={29} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does NOT render the hint when skillCount is exactly 30 (boundary)", () => {
    render(<SkillsScaleHint {...baseProps} skillCount={30} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does NOT render the hint when viewMode is dense", () => {
    render(<SkillsScaleHint {...baseProps} viewMode="dense" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does NOT render the hint when viewMode is heatmap", () => {
    render(<SkillsScaleHint {...baseProps} viewMode="heatmap" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does NOT render the hint when viewMode is list", () => {
    render(<SkillsScaleHint {...baseProps} viewMode="list" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does NOT render the hint on mobile (isMobile gate is inside the component)", () => {
    render(<SkillsScaleHint {...baseProps} isMobile />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("has role=status (accessible name comes from the text content, not aria-label)", () => {
    render(<SkillsScaleHint {...baseProps} />);
    const status = screen.getByRole("status");
    // The status live region's accessible name comes from its text content.
    // aria-label would mask the message in some screen readers.
    expect(status.getAttribute("aria-label")).toBeNull();
    expect(status.textContent).toMatch(/30\+ skills visible/i);
  });

  it("dismiss button hides the hint", () => {
    render(<SkillsScaleHint {...baseProps} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dismiss hint/i }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("dismiss button has aria-label='Dismiss hint'", () => {
    render(<SkillsScaleHint {...baseProps} />);
    expect(screen.getByRole("button", { name: /dismiss hint/i })).toBeInTheDocument();
  });

  it("mentions both Dense and Heatmap modes in the hint text", () => {
    render(<SkillsScaleHint {...baseProps} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/Dense/i);
    expect(status.textContent).toMatch(/Heatmap/i);
  });

  it("mentions the column selector in the hint text", () => {
    render(<SkillsScaleHint {...baseProps} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/column selector/i);
  });

  it("reappears after re-mount (dismissal is NOT persisted)", () => {
    const { unmount } = render(<SkillsScaleHint {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss hint/i }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();
    // Re-mount — the hint should reappear because dismissal is component-local.
    render(<SkillsScaleHint {...baseProps} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
