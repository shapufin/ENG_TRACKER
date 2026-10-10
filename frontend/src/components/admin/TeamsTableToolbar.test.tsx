import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TeamsTableToolbar } from "./TeamsTableToolbar";

const renderToolbar = (
  columnVisibility: Record<string, boolean> = {},
  onColumnVisibilityChange = vi.fn()
) =>
  render(
    <TeamsTableToolbar
      searchQuery=""
      onSearchChange={vi.fn()}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={onColumnVisibilityChange}
    />
  );

describe("TeamsTableToolbar Columns menu", () => {
  it("opens a Toggle Columns dialog listing all six data columns", () => {
    renderToolbar();
    fireEvent.click(screen.getByText("Columns (6/6)"));
    expect(screen.getByText("Toggle Columns")).toBeInTheDocument();
    for (const label of ["Team", "Code", "Calendar Group", "Members", "Leader", "Actions"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("reports the updated visibility map when a column is toggled off", () => {
    const onChange = vi.fn();
    renderToolbar({}, onChange);
    fireEvent.click(screen.getByText("Columns (6/6)"));
    fireEvent.click(screen.getByLabelText("Code"));
    expect(onChange).toHaveBeenCalledWith({ code: false });
  });

  it("Reset to Defaults marks every column visible", () => {
    const onChange = vi.fn();
    renderToolbar({ code: false }, onChange);
    fireEvent.click(screen.getByText("Columns (5/6)"));
    fireEvent.click(screen.getByText("Reset to Defaults"));
    expect(onChange).toHaveBeenCalledWith({
      team: true,
      code: true,
      calendar_group: true,
      members: true,
      leader: true,
      actions: true,
    });
  });
});
