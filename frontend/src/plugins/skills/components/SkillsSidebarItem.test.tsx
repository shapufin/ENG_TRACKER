import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SkillsSidebarItem from "./SkillsSidebarItem";

const usePermissionsMock = vi.fn();

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => usePermissionsMock(),
}));

vi.mock("framer-motion", () => ({
  motion: { div: ({ children }: any) => <div>{children}</div> },
  useReducedMotion: () => false,
}));

const basePerms = {
  isCRUser: false,
  isCRAdmin: false,
  isAdmin: false,
  isSuperuser: false,
  isHR: false,
  isTeamLeader: false,
};

const renderAt = (pathname = "/dashboard") =>
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <SkillsSidebarItem />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  usePermissionsMock.mockReturnValue({ ...basePerms });
});

describe("SkillsSidebarItem", () => {
  it("renders the Skills group parent label", () => {
    renderAt();
    expect(screen.getByText("Skills")).toBeInTheDocument();
  });

  it("shows My Skills sub-item when group is expanded", () => {
    renderAt();
    fireEvent.click(screen.getByText("Skills"));
    expect(screen.getByText("My Skills")).toBeInTheDocument();
  });

  it("does not show Team Skills for a plain employee", () => {
    renderAt();
    fireEvent.click(screen.getByText("Skills"));
    expect(screen.queryByText("Team Skills")).not.toBeInTheDocument();
  });

  it("shows Team Skills sub-item for a TL when expanded", () => {
    usePermissionsMock.mockReturnValue({ ...basePerms, isTeamLeader: true });
    renderAt();
    fireEvent.click(screen.getByText("Skills"));
    expect(screen.getByText("Team Skills")).toBeInTheDocument();
  });

  it("shows Team Skills sub-item for HR when expanded", () => {
    usePermissionsMock.mockReturnValue({ ...basePerms, isHR: true });
    renderAt();
    fireEvent.click(screen.getByText("Skills"));
    expect(screen.getByText("Team Skills")).toBeInTheDocument();
  });

  it("renders nothing for a CR-only user", () => {
    usePermissionsMock.mockReturnValue({ ...basePerms, isCRUser: true });
    const { container } = renderAt();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a CR-only admin (no higher role)", () => {
    usePermissionsMock.mockReturnValue({ ...basePerms, isCRAdmin: true });
    const { container } = renderAt();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders for a multi-role CR+TL user (higher role wins)", () => {
    usePermissionsMock.mockReturnValue({
      ...basePerms,
      isCRUser: false,
      isCRAdmin: true,
      isTeamLeader: true,
    });
    renderAt();
    fireEvent.click(screen.getByText("Skills"));
    expect(screen.getByText("Team Skills")).toBeInTheDocument();
  });

  it("always includes Skill History sub-item when expanded", () => {
    renderAt();
    fireEvent.click(screen.getByText("Skills"));
    expect(screen.getByText("Skill History")).toBeInTheDocument();
  });

  it("auto-expands when active route is /skills", () => {
    renderAt("/skills");
    expect(screen.getByText("My Skills")).toBeInTheDocument();
  });

  it("auto-expands when active route is /skills/team", () => {
    usePermissionsMock.mockReturnValue({ ...basePerms, isTeamLeader: true });
    renderAt("/skills/team");
    expect(screen.getByText("Team Skills")).toBeInTheDocument();
  });

  it("auto-expands when active route is /skills/history", () => {
    renderAt("/skills/history");
    expect(screen.getByText("Skill History")).toBeInTheDocument();
  });
});
