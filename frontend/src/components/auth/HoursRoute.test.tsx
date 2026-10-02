import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HoursRoute } from "./HoursRoute";
import { usePermissions } from "@/context/PermissionContext";

vi.mock("@/context/PermissionContext", () => ({ usePermissions: vi.fn() }));

const renderAt = (perms: Record<string, boolean>) => {
  vi.mocked(usePermissions).mockReturnValue(perms as never);
  render(
    <MemoryRouter initialEntries={["/overtime"]}>
      <Routes>
        <Route element={<HoursRoute />}>
          <Route path="/overtime" element={<div>overtime page</div>} />
        </Route>
        <Route path="/dashboard" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe("HoursRoute", () => {
  it("sends an HBPR-only user home", () => {
    renderAt({ isHBPROnly: true });
    expect(screen.getByText("home")).toBeInTheDocument();
  });

  it.each(["isTeamLeader", "isHR", "isAdmin", "isSuperuser"])(
    "lets an HBPR who is also %s through",
    (role) => {
      renderAt({ isHBPR: true, [role]: true });
      expect(screen.getByText("overtime page")).toBeInTheDocument();
    }
  );

  it("lets an ordinary employee through", () => {
    renderAt({});
    expect(screen.getByText("overtime page")).toBeInTheDocument();
  });
});
