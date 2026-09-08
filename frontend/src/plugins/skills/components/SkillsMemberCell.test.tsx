import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkillsMemberCell } from "./SkillsMemberCell";
import type { TeamMatrixRow } from "../types/skills";

const row: TeamMatrixRow = {
  user_id: 100,
  username: "alice",
  full_name: "Alice Aardvark",
  skills: [],
};

describe("SkillsMemberCell", () => {
  it("renders a gradient avatar chip with initials and the display name", () => {
    render(<SkillsMemberCell row={row} />);
    const avatar = screen.getByText("AA");
    expect(avatar.className).toContain("bg-gradient-to-br");
    expect(avatar.className).not.toMatch(/slate-|zinc-/);
    expect(screen.getByText("Alice Aardvark")).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
  });

  it("falls back to the username when full_name is absent", () => {
    render(<SkillsMemberCell row={{ ...row, full_name: undefined }} />);
    expect(screen.getByText("alice")).toBeInTheDocument();
    // No @username subtitle when display name === username.
    expect(screen.queryByText("@alice")).not.toBeInTheDocument();
  });

  it("full variant avatar is h-7 w-7 rounded-lg", () => {
    render(<SkillsMemberCell row={row} />);
    expect(screen.getByText("AA").className).toContain("h-7 w-7 rounded-lg");
  });

  it("compact variant renders a single truncated line without the @username element", () => {
    render(<SkillsMemberCell row={row} compact />);
    expect(screen.getByText("Alice Aardvark")).toBeInTheDocument();
    expect(screen.queryByText("@alice")).not.toBeInTheDocument();
    const name = screen.getByText("Alice Aardvark");
    expect(name.className).toContain("truncate");
    expect(name.getAttribute("title")).toBe("Alice Aardvark (@alice)");
  });

  it("compact variant avatar is h-6 w-6 rounded-md", () => {
    render(<SkillsMemberCell row={row} compact />);
    expect(screen.getByText("AA").className).toContain("h-6 w-6 rounded-md");
  });

  it("is deterministic — the same user always gets the same gradient", () => {
    const { unmount } = render(<SkillsMemberCell row={row} />);
    const first = screen.getByText("AA").className;
    unmount();
    render(<SkillsMemberCell row={row} />);
    expect(screen.getByText("AA").className).toBe(first);
  });
});
