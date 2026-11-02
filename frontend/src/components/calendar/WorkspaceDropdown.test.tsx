import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkspaceDropdown } from "./WorkspaceDropdown";
import type { CalendarWorkspace } from "@/types";

const mockWorkspaces: CalendarWorkspace[] = [
  { id: 1, name: "Alpha Squad" } as CalendarWorkspace,
  { id: 2, name: "Beta Squad" } as CalendarWorkspace,
  { id: 3, name: "Gamma Squad" } as CalendarWorkspace,
];

describe("WorkspaceDropdown", () => {
  it("renders trigger button with count and accessible label", () => {
    render(
      <WorkspaceDropdown
        workspaces={mockWorkspaces}
        selectedIds={[1]}
        isMultiSelect={false}
        canMultiSelect={false}
        onChange={vi.fn()}
      />
    );

    const trigger = screen.getByRole("button", { name: /select teams \(1 selected\)/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens checklist dialog on trigger click and closes on escape", () => {
    render(
      <WorkspaceDropdown
        workspaces={mockWorkspaces}
        selectedIds={[1]}
        isMultiSelect={false}
        canMultiSelect={true}
        onChange={vi.fn()}
      />
    );

    const trigger = screen.getByRole("button", { name: /select teams/i });
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: /select active teams/i })).toBeInTheDocument();
    expect(screen.getAllByText("Alpha Squad").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Beta Squad")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clicking checkbox triggers onChange with team id", () => {
    const onChange = vi.fn();
    render(
      <WorkspaceDropdown
        workspaces={mockWorkspaces}
        selectedIds={[1]}
        isMultiSelect={true}
        canMultiSelect={true}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /select teams/i }));

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();

    fireEvent.click(checkboxes[1]);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("All button selects every team in one update", () => {
    const onSelectionChange = vi.fn();
    render(
      <WorkspaceDropdown
        workspaces={mockWorkspaces}
        selectedIds={[1]}
        isMultiSelect={true}
        canMultiSelect={true}
        onChange={vi.fn()}
        onSelectionChange={onSelectionChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /select teams/i }));
    fireEvent.click(screen.getByRole("button", { name: /^all$/i }));

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("Single keeps only the first selected team in one update", () => {
    const onSelectionChange = vi.fn();
    render(
      <WorkspaceDropdown
        workspaces={mockWorkspaces}
        selectedIds={[2, 3]}
        isMultiSelect={true}
        canMultiSelect={true}
        onChange={vi.fn()}
        onSelectionChange={onSelectionChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /select teams/i }));
    fireEvent.click(screen.getByRole("button", { name: /^single$/i }));

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledWith([2]);
  });

  it("renders the panel outside a clipping ancestor", () => {
    render(
      <div data-testid="clip" style={{ overflow: "hidden" }}>
        <WorkspaceDropdown
          workspaces={mockWorkspaces}
          selectedIds={[1]}
          isMultiSelect={true}
          canMultiSelect={true}
          onChange={vi.fn()}
          onSelectionChange={vi.fn()}
        />
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: /select teams/i }));

    const panel = screen.getByRole("dialog", { name: /select active teams/i });
    expect(screen.getByTestId("clip")).not.toContainElement(panel);
  });
});
