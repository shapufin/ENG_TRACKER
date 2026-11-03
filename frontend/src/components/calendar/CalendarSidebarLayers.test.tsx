import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalendarSidebarLayers } from "./CalendarSidebarLayers";

const layers = [
  { id: 1, name: "E2E Test Team", code: "E2E_TEAM", count: 9, active: true },
  { id: 2, name: "Platform", code: "PLT", active: false },
];

describe("CalendarSidebarLayers", () => {
  it("shows every workspace with its active count in the heading", () => {
    render(<CalendarSidebarLayers layers={layers} onToggleLayer={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Team Layers \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /E2E Test Team/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /Platform/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("toggles the layer that was pressed", () => {
    const onToggleLayer = vi.fn();
    render(<CalendarSidebarLayers layers={layers} onToggleLayer={onToggleLayer} />);

    fireEvent.click(screen.getByRole("button", { name: /Platform/ }));
    expect(onToggleLayer).toHaveBeenCalledWith(2);
  });

  it("prints a count only when the roster is known", () => {
    render(<CalendarSidebarLayers layers={layers} onToggleLayer={vi.fn()} />);

    // A workspace whose members were never requested shows no number rather than a false 0.
    expect(screen.getByRole("button", { name: /E2E Test Team/ })).toHaveTextContent("9");
    expect(screen.getByRole("button", { name: /Platform/ })).not.toHaveTextContent(/\d/);
  });

  it("collapses the layer list from its heading", () => {
    render(<CalendarSidebarLayers layers={layers} onToggleLayer={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Team Layers/ }));
    expect(screen.queryByRole("button", { name: /E2E Test Team/ })).not.toBeInTheDocument();
  });

  it("renders nothing when the viewer has no workspaces", () => {
    const { container } = render(<CalendarSidebarLayers layers={[]} onToggleLayer={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
