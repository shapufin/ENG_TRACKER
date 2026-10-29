import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HrRestrictedRoute } from "./HrRestrictedRoute";
import { usePermissions } from "@/context/PermissionContext";

vi.mock("@/context/PermissionContext", () => ({ usePermissions: vi.fn() }));

const renderAt = (perms: Record<string, boolean>) => {
  vi.mocked(usePermissions).mockReturnValue(perms as never);
  render(
    <MemoryRouter initialEntries={["/calendar"]}>
      <Routes>
        <Route element={<HrRestrictedRoute />}>
          <Route path="/calendar" element={<div>calendar page</div>} />
        </Route>
        <Route path="/dashboard" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe("HrRestrictedRoute", () => {
  it("sends a pure-HR user home", () => {
    renderAt({ isHR: true, isHROnly: true });
    expect(screen.getByText("home")).toBeInTheDocument();
  });

  it.each(["isTeamLeader", "isAdmin", "isSuperuser"])(
    "lets HR who is also %s through",
    (role) => {
      renderAt({ isHR: true, isHROnly: false, [role]: true });
      expect(screen.getByText("calendar page")).toBeInTheDocument();
    }
  );

  it("lets an ordinary employee through", () => {
    renderAt({});
    expect(screen.getByText("calendar page")).toBeInTheDocument();
  });
});
