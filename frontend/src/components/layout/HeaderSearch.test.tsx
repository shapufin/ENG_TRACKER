import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LayoutDashboard, Clock } from "lucide-react";
import { HeaderSearch } from "./HeaderSearch";
import type { NavItem } from "./hooks/useVisibleNavItems";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const items: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "core" },
  { path: "/overtime", label: "Overtime", icon: Clock, section: "core" },
];

const renderSearch = () =>
  render(
    <MemoryRouter>
      <HeaderSearch items={items} />
    </MemoryRouter>
  );

describe("HeaderSearch", () => {
  it("shows no results before typing", () => {
    renderSearch();
    expect(screen.queryByText("Overtime")).not.toBeInTheDocument();
  });

  it("filters nav items by query", () => {
    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "over" } });
    expect(screen.getByText("Overtime")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("navigates when a result is clicked", () => {
    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "over" } });
    fireEvent.click(screen.getByText("Overtime"));
    expect(mockNavigate).toHaveBeenCalledWith("/overtime");
  });

  it("shows an empty state when nothing matches", () => {
    renderSearch();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz-no-match" } });
    expect(screen.getByText(/No pages found/)).toBeInTheDocument();
  });

  it("clears and closes on Escape", () => {
    renderSearch();
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "over" } });
    expect(screen.getByText("Overtime")).toBeInTheDocument();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByText("Overtime")).not.toBeInTheDocument();
  });

  it("navigates to the first result on Enter", () => {
    renderSearch();
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });
});
