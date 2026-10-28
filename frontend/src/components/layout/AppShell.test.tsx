import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Clock } from "lucide-react";
import { AppShell } from "./AppShell";
import { userService } from "@/services/userService";

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: 5, username: "emp" } }) }));
vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => ({
    isAdmin: false,
    isHR: false,
    isHBPR: false,
    isHBPROnly: false,
    isTeamLeader: false,
    isEmployee: true,
    isSuperuser: false,
    isCRAdmin: false,
    isCRUser: false,
  }),
}));
vi.mock("@/hooks/useLogout", () => ({ useLogout: () => vi.fn() }));
vi.mock("@/hooks/usePendingApprovalCount", () => ({ usePendingApprovalCount: () => 0 }));
vi.mock("@/hooks/useSiteBranding", () => ({
  useSiteBranding: () => ({ data: { site_name: "Engineering Tracker" } }),
}));

const maintenance = vi.hoisted(() => ({ active: false }));
vi.mock("@/hooks/useMaintenanceStatus", () => ({
  useMaintenanceStatus: () => ({
    data: maintenance.active
      ? {
          active: true,
          title: "Upgrade window",
          message: "Back shortly.",
          started_at: null,
          ends_at: null,
          updated_at: null,
          site_name: "Engineering Tracker",
          logo_url: null,
        }
      : undefined,
  }),
}));
vi.mock("@/components/plugins/PluginSlot", () => ({ PluginSlot: () => null }));
vi.mock("./Sidebar", () => ({ Sidebar: () => <div data-testid="sidebar" /> }));
vi.mock("./TeamContextPill", () => ({ TeamContextPill: () => null }));
vi.mock("./MobileOverlay", () => ({ MobileOverlay: () => null }));
vi.mock("./HeaderProfileMenu", () => ({ HeaderProfileMenu: () => null }));
vi.mock("./HeaderSearch", () => ({ HeaderSearch: () => <input aria-label="Search pages box" /> }));
vi.mock("./MainContentTransition", () => ({
  MainContentTransition: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./hooks/useVisibleNavItems", async () => {
  const actual = await vi.importActual<typeof import("./hooks/useVisibleNavItems")>(
    "./hooks/useVisibleNavItems"
  );
  return {
    ...actual,
    useVisibleNavItems: () => [
      { path: "/overtime", label: "Overtime", icon: Clock, section: "core" },
      { path: "/calendar", label: "Calendar", icon: Clock, section: "core" },
    ],
  };
});
vi.mock("@/services/userService", () => ({ userService: { getProfiles: vi.fn() } }));

const renderShell = () =>
  render(
    <MemoryRouter initialEntries={["/overtime"]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/overtime" element={<div>page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
  vi.mocked(userService.getProfiles).mockReset();
});

describe("AppShell command palette", () => {
  it("Ctrl+K opens the palette with the viewer's visible pages", async () => {
    renderShell();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    const notPrevented = fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(notPrevented).toBe(false);
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Overtime",
      "Calendar",
    ]);
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("never searches users from the main app", async () => {
    vi.useFakeTimers();
    renderShell();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "ana" } });
    await vi.advanceTimersByTimeAsync(500);
    expect(userService.getProfiles).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("keeps the header search box", () => {
    renderShell();
    expect(screen.getByLabelText("Search pages box")).toBeInTheDocument();
  });

  it("shows the maintenance banner only while the site is closed", () => {
    maintenance.active = false;
    const { unmount } = renderShell();
    expect(screen.queryByText(/Maintenance mode is ON/)).not.toBeInTheDocument();
    unmount();

    maintenance.active = true;
    renderShell();

    expect(screen.getByText(/Maintenance mode is ON/)).toBeInTheDocument();
    maintenance.active = false;
  });
});
