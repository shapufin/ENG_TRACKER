import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActiveFilterChips } from "./ActiveFilterChips";

describe("ActiveFilterChips", () => {
  it("renders nothing when no filter is active", () => {
    const { container } = render(<ActiveFilterChips chips={[]} onReset={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each active filter with its name and value", () => {
    render(
      <ActiveFilterChips
        chips={[
          { id: "team", label: "Team", value: "Core Team", onRemove: vi.fn() },
          { id: "ws", label: "Workspace", value: "Tirana", onRemove: vi.fn() },
        ]}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByText("Team: Core Team")).toBeInTheDocument();
    expect(screen.getByText("Workspace: Tirana")).toBeInTheDocument();
  });

  it("removes a single filter from its own button", () => {
    const removeTeam = vi.fn();
    const removeWs = vi.fn();
    render(
      <ActiveFilterChips
        chips={[
          { id: "team", label: "Team", value: "Core Team", onRemove: removeTeam },
          { id: "ws", label: "Workspace", value: "Tirana", onRemove: removeWs },
        ]}
        onReset={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Team: Core Team" }));
    expect(removeTeam).toHaveBeenCalledTimes(1);
    expect(removeWs).not.toHaveBeenCalled();
  });

  it("resets every filter from the reset button", () => {
    const onReset = vi.fn();
    render(
      <ActiveFilterChips
        chips={[{ id: "team", label: "Team", value: "Core Team", onRemove: vi.fn() }]}
        onReset={onReset}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset all filters" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
