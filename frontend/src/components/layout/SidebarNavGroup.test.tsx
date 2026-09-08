import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarNavGroup } from "./SidebarNavGroup";
import { Award, ChevronDown } from "lucide-react";

vi.mock("framer-motion", () => ({
  motion: { div: ({ children }: any) => <div>{children}</div> },
  useReducedMotion: () => false,
}));

const items = [
  { to: "/skills", label: "My Skills", icon: Award },
  { to: "/skills/team", label: "Team Skills", icon: Award },
  { to: "/skills/history", label: "Skill History", icon: Award },
];

const renderGroup = (pathname = "/dashboard", collapsed = false) =>
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <SidebarNavGroup label="Skills" icon={Award} items={items} collapsed={collapsed} />
    </MemoryRouter>
  );

describe("SidebarNavGroup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the parent label in expanded mode", () => {
    renderGroup();
    expect(screen.getByText("Skills")).toBeInTheDocument();
  });

  it("does not show sub-items by default when no child is active", () => {
    renderGroup();
    expect(screen.queryByText("My Skills")).not.toBeInTheDocument();
    expect(screen.queryByText("Team Skills")).not.toBeInTheDocument();
    expect(screen.queryByText("Skill History")).not.toBeInTheDocument();
  });

  it("auto-expands when a child route is active", () => {
    renderGroup("/skills/team");
    expect(screen.getByText("Team Skills")).toBeInTheDocument();
  });

  it("toggles sub-items on parent click", () => {
    renderGroup();
    expect(screen.queryByText("My Skills")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Skills"));
    expect(screen.getByText("My Skills")).toBeInTheDocument();
    expect(screen.getByText("Skill History")).toBeInTheDocument();
  });

  it("collapses sub-items on second click", () => {
    renderGroup();
    fireEvent.click(screen.getByText("Skills"));
    expect(screen.getByText("My Skills")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Skills"));
    expect(screen.queryByText("My Skills")).not.toBeInTheDocument();
  });

  it("does not show parent label inline when collapsed", () => {
    renderGroup("/dashboard", true);
    const trigger = screen.getByRole("button", { name: "Skills" });
    expect(trigger.className).toContain("md:justify-center");
  });

  it("shows flyout on hover when collapsed", () => {
    renderGroup("/dashboard", true);
    expect(screen.queryByText("My Skills")).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Skills" }));
    expect(screen.getByText("My Skills")).toBeInTheDocument();
    expect(screen.getByText("Skill History")).toBeInTheDocument();
  });

  it("renders a chevron icon that rotates when expanded", () => {
    renderGroup();
    const chevron = screen.getByTestId("sidebar-group-chevron");
    expect(chevron.getAttribute("class")).toContain("rotate-0");
    fireEvent.click(screen.getByText("Skills"));
    expect(chevron.getAttribute("class")).toContain("rotate-90");
  });

  it("active parent and child links use text-foreground for text, text-primary for icons", () => {
    renderGroup("/skills/team");
    const parent = screen.getByRole("button", { name: "Skills" });
    expect(parent.className).toContain("text-foreground");
    expect(parent.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
    const child = screen.getByRole("menuitem", { name: "Team Skills" });
    expect(child.className).toContain("text-foreground");
    expect(child.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
    expect(child.querySelector("svg")?.getAttribute("class")).toContain("text-primary");
  });
});
