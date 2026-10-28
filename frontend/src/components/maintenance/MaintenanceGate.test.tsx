import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { MaintenanceStatus } from "@/types";

const auth = vi.hoisted(() => ({
  user: null as null | { is_staff?: boolean; is_superuser?: boolean },
  isLoading: false,
}));
const maintenance = vi.hoisted(() => ({
  data: undefined as MaintenanceStatus | undefined,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/useMaintenanceStatus", () => ({
  MAINTENANCE_ACTIVE_EVENT: "maintenance:active",
  useMaintenanceStatus: () => maintenance,
}));

import { MaintenanceGate } from "./MaintenanceGate";

const active: MaintenanceStatus = {
  active: true,
  title: "Upgrade window",
  message: "Back shortly.",
  started_at: "2026-10-27T20:00:00Z",
  ends_at: null,
  updated_at: "2026-10-27T20:00:00Z",
  site_name: "Engineering Tracker",
  logo_url: null,
};

const renderGate = (path = "/dashboard") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MaintenanceGate>
        <p>app content</p>
      </MaintenanceGate>
    </MemoryRouter>
  );

const reload = vi.fn();

beforeEach(() => {
  auth.user = null;
  auth.isLoading = false;
  maintenance.data = undefined;
  maintenance.isError = false;
  maintenance.refetch.mockClear();
  reload.mockClear();
  vi.stubGlobal("location", { ...window.location, reload });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MaintenanceGate", () => {
  it("shows the maintenance screen to an anonymous visitor", () => {
    maintenance.data = active;
    renderGate();

    expect(screen.getByRole("heading", { name: "Upgrade window" })).toBeInTheDocument();
    expect(screen.queryByText("app content")).not.toBeInTheDocument();
  });

  it("shows the maintenance screen to a signed-in employee", () => {
    auth.user = { is_staff: false };
    maintenance.data = active;
    renderGate();

    expect(screen.queryByText("app content")).not.toBeInTheDocument();
  });

  it("lets staff admins through", () => {
    auth.user = { is_staff: true };
    maintenance.data = active;
    renderGate();

    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  it("lets superusers through", () => {
    auth.user = { is_superuser: true };
    maintenance.data = active;
    renderGate();

    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  it("shows the maintenance screen on /login unless the admin entry is requested", () => {
    maintenance.data = active;
    renderGate("/login");

    expect(screen.queryByText("app content")).not.toBeInTheDocument();
  });

  it("lets the admin entry link through to the sign-in form", () => {
    maintenance.data = active;
    renderGate("/login?admin=1");

    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  it("fails open when the status request errors", () => {
    maintenance.data = undefined;
    maintenance.isError = true;
    renderGate();

    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  it("fails open while the status is still loading", () => {
    renderGate();

    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  it("does not reload a tab that never showed the maintenance screen", () => {
    auth.user = { is_staff: true };
    maintenance.data = active;
    const { rerender } = renderGate();

    maintenance.data = { ...active, active: false };
    rerender(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <MaintenanceGate>
          <p>app content</p>
        </MaintenanceGate>
      </MemoryRouter>
    );

    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads into the app when maintenance ends", () => {
    maintenance.data = active;
    const { rerender } = renderGate();

    maintenance.data = { ...active, active: false };
    rerender(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <MaintenanceGate>
          <p>app content</p>
        </MaintenanceGate>
      </MemoryRouter>
    );

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload while a staff session is still being restored", () => {
    // The gate must not treat "user not known yet" as "locked out": that
    // reloaded the tab on every boot for staff admins.
    maintenance.data = active;
    auth.isLoading = true;
    const { rerender } = renderGate();
    expect(reload).not.toHaveBeenCalled();

    auth.isLoading = false;
    auth.user = { is_staff: true };
    rerender(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <MaintenanceGate>
          <p>app content</p>
        </MaintenanceGate>
      </MemoryRouter>
    );

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText("app content")).toBeInTheDocument();
  });
});
