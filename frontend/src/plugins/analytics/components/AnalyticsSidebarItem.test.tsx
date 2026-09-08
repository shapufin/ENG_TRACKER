import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import AnalyticsSidebarItem from "./AnalyticsSidebarItem";

const canView = vi.fn();
const collapsedState = { value: false };

vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: () => ({ canView }),
}));
vi.mock("@/components/layout/SidebarContext", () => ({
  useSidebarCollapsed: () => collapsedState.value,
}));

beforeEach(() => {
  canView.mockReset();
  collapsedState.value = false;
});

describe("AnalyticsSidebarItem (user sidebar)", () => {
  it("hides when analytics view permission is denied", () => {
    canView.mockReturnValue(false);
    render(<AnalyticsSidebarItem />, { wrapper: MemoryRouter });
    expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
  });

  it("renders the analytics navigation link when allowed", () => {
    canView.mockReturnValue(true);
    render(
      <MemoryRouter initialEntries={["/analytics"]}>
        <AnalyticsSidebarItem />
      </MemoryRouter>
    );
    expect(screen.getByRole("menuitem", { name: "Analytics" })).toHaveAttribute(
      "href",
      "/analytics"
    );
  });

  it("shows the label tooltip on hover when collapsed", () => {
    canView.mockReturnValue(true);
    collapsedState.value = true;
    render(
      <MemoryRouter initialEntries={["/analytics"]}>
        <AnalyticsSidebarItem />
      </MemoryRouter>
    );
    const link = screen.getByRole("menuitem");
    // Collapsed: no inline label, link is centered.
    expect(link.className).toContain("md:justify-center");
    expect(screen.queryByRole("tooltip", { name: "Analytics" })).not.toBeInTheDocument();
    fireEvent.mouseEnter(link);
    fireEvent.focus(link);
    expect(screen.getByRole("tooltip", { name: "Analytics" })).toBeInTheDocument();
  });
});
