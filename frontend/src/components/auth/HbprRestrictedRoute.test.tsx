import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { HbprRestrictedRoute } from "./HbprRestrictedRoute";

const perms = { value: {} as Record<string, boolean> };

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => perms.value,
}));

const renderAt = (path = "/calendar") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<HbprRestrictedRoute />}>
          <Route path="/calendar" element={<div>Calendar page</div>} />
        </Route>
        <Route path="/hbpr" element={<div>HBPR workspace</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("HbprRestrictedRoute", () => {
  it("redirects an HBPR-only user to their /hbpr workspace", () => {
    perms.value = { isHBPROnly: true };
    renderAt();
    expect(screen.getByText("HBPR workspace")).toBeInTheDocument();
    expect(screen.queryByText("Calendar page")).not.toBeInTheDocument();
  });

  it("lets a multi-role HBPR+HR user through", () => {
    perms.value = { isHBPROnly: false };
    renderAt();
    expect(screen.getByText("Calendar page")).toBeInTheDocument();
  });

  it("lets a plain employee through", () => {
    perms.value = { isHBPROnly: false, isEmployee: true };
    renderAt("/calendar");
    expect(screen.getByText("Calendar page")).toBeInTheDocument();
  });
});
