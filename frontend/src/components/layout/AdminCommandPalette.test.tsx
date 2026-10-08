import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { Users, Clock, Sun } from "lucide-react";
import { AdminCommandPalette } from "./AdminCommandPalette";
import type { AdminNavItem } from "./hooks/useAdminNavItems";

const items: AdminNavItem[] = [
  { path: "/admin/users", label: "Users", icon: Users, group: "People" },
  { path: "/admin/overtime-logs", label: "Overtime Logs", icon: Clock, group: "Operations" },
  { path: "/admin/leave-requests", label: "Leave Requests", icon: Sun, group: "Operations" },
];

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;

const setup = (list = items) => {
  const onOpenChange = vi.fn();
  render(
    <MemoryRouter initialEntries={["/admin"]}>
      <AdminCommandPalette items={list} open onOpenChange={onOpenChange} />
      <Where />
    </MemoryRouter>
  );
  return { onOpenChange, input: screen.getByRole("combobox") };
};

describe("AdminCommandPalette", () => {
  it("lists every item with its group", () => {
    setup();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("filters by label and by group, case-insensitively", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "LEAVE" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      expect.stringContaining("Leave Requests"),
    ]);
    fireEvent.change(input, { target: { value: "operations" } });
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("shows an empty state when nothing matches", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("moves the active option with the arrow keys, wrapping, and exposes it to AT", () => {
    const { input } = setup();
    const active = () => screen.getByRole("option", { selected: true }).textContent;
    expect(active()).toContain("Users");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(active()).toContain("Overtime Logs");
    expect(input.getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { selected: true }).id
    );
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(active()).toContain("Leave Requests");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(active()).toContain("Users");
  });

  it("Enter navigates to the active option and closes", () => {
    const { input, onOpenChange } = setup();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("where")).toHaveTextContent("/admin/overtime-logs");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clicking an option navigates and closes", () => {
    const { onOpenChange } = setup();
    fireEvent.click(screen.getByRole("option", { name: /Leave Requests/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/admin/leave-requests");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("only lists the items it was given (CR-scoped lists stay scoped)", () => {
    setup([items[0]]);
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.queryByText("Overtime Logs")).not.toBeInTheDocument();
  });

  it("Enter with no match does nothing", () => {
    const { input, onOpenChange } = setup();
    fireEvent.change(input, { target: { value: "zzz" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("where")).toHaveTextContent("/admin");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
