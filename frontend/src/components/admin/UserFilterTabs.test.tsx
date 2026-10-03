import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeAll } from "vitest";
import { UserFilterTabs } from "./UserFilterTabs";

beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList);
});

describe("UserFilterTabs", () => {
  it("renders Employees, both TL tabs, HBPR and HR — no CR Admin by default", () => {
    render(<UserFilterTabs filter="employee" onFilterChange={vi.fn()} />);

    for (const label of ["Employees", "Italian TL", "Albanian TL", "HBPR", "HR"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "CR Admin" })).not.toBeInTheDocument();
  });

  it("shows the CR Admin tab only when the control_room plugin is active", () => {
    render(<UserFilterTabs filter="employee" onFilterChange={vi.fn()} showCRAdmin />);
    expect(screen.getByRole("button", { name: "CR Admin" })).toBeInTheDocument();
  });

  it("reports the clicked role key", () => {
    const onFilterChange = vi.fn();
    render(<UserFilterTabs filter="employee" onFilterChange={onFilterChange} showCRAdmin />);

    fireEvent.click(screen.getByRole("button", { name: "HBPR" }));
    expect(onFilterChange).toHaveBeenCalledWith("hbpr");

    fireEvent.click(screen.getByRole("button", { name: "CR Admin" }));
    expect(onFilterChange).toHaveBeenCalledWith("cr_admin");
  });
});
