import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HeaderProfileMenu } from "./HeaderProfileMenu";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderMenu = (props = {}) =>
  render(
    <MemoryRouter>
      <HeaderProfileMenu
        user={{ first_name: "Alex", last_name: "Rivera", email: "alex@example.com" }}
        roleSubtitle="Team Leader"
        onLogout={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );

describe("HeaderProfileMenu", () => {
  it("renders initials on the trigger", () => {
    renderMenu();
    expect(screen.getByRole("button", { name: "Account menu" })).toHaveTextContent("AR");
  });

  it("shows name and role after opening", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("Team Leader")).toBeInTheDocument();
  });

  it("calls onLogout when Logout is clicked", () => {
    const onLogout = vi.fn();
    renderMenu({ onLogout });
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByText("Logout"));
    expect(onLogout).toHaveBeenCalled();
  });

  it("navigates to settings when Settings is clicked", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByText("Settings"));
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });
});
