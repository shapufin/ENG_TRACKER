import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HolidayTable } from "./HolidayTable";

// DataTable (TanStack) needs ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const HOLIDAYS = [
  {
    id: 1,
    name: "Christmas",
    formattedDate: "2026-12-25",
    country_code: "IT",
    is_global: true,
    scope: "Global",
  },
];

const noop = vi.fn();

describe("HolidayTable", () => {
  it("renders holidays as a data grid with accessible row actions", () => {
    const { container } = render(
      <HolidayTable holidays={HOLIDAYS} isLoading={false} onEdit={noop} onDelete={noop} />
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Christmas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete 1" })).toBeInTheDocument();
    // DataTable owns the single scroll viewport — no second overflow-x-auto wrapper.
    expect(container.querySelectorAll(".overflow-x-auto")).toHaveLength(1);
  });

  it("adds no search box (searchColumn is deliberately omitted)", () => {
    render(<HolidayTable holidays={HOLIDAYS} isLoading={false} onEdit={noop} onDelete={noop} />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the empty state and no table when there are no holidays", () => {
    render(<HolidayTable holidays={[]} isLoading={false} onEdit={noop} onDelete={noop} />);

    expect(screen.getByText(/no holidays defined yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("uses the compact left-aligned empty state, not the centred block", () => {
    const { container } = render(
      <HolidayTable holidays={[]} isLoading={false} onEdit={noop} onDelete={noop} />
    );

    expect(container.querySelector(".text-center")).toBeNull();
  });

  it("renders no table while loading", () => {
    render(<HolidayTable holidays={[]} isLoading onEdit={noop} onDelete={noop} />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
