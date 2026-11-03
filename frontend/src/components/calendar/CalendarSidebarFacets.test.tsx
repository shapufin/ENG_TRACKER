import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CalendarSidebarFacets } from "./CalendarSidebarFacets";
import { NO_FACETS } from "./calendarFacets";
import type { User } from "@/types";

const person = (id: number, clients: [number, string][], techs: [number, string][]) =>
  ({
    id,
    clients_detail: clients.map(([cid, name]) => ({ id: cid, name, code: name })),
    techs_detail: techs.map(([tid, name]) => ({ id: tid, name, code: name, level: null })),
  }) as unknown as User;

const users = [person(1, [[10, "Acme"]], [[20, "DB"]]), person(2, [[11, "Beta"]], [[20, "DB"]])];

/** The chips live behind a disclosure so the roster keeps the height. */
const openFilters = () => fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));

describe("CalendarSidebarFacets", () => {
  it("starts collapsed so the roster keeps the vertical space", () => {
    render(<CalendarSidebarFacets users={users} selection={NO_FACETS} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByText("Client")).not.toBeInTheDocument();
  });

  it("stays open while a facet is applied", () => {
    render(
      <CalendarSidebarFacets
        users={users}
        selection={{ client: "10", tech: null }}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("button", { name: /Acme/ })).toBeInTheDocument();
  });

  it("draws a row only when it offers a real choice", () => {
    render(<CalendarSidebarFacets users={users} selection={NO_FACETS} onChange={vi.fn()} />);
    openFilters();
    expect(screen.getByText("Client")).toBeInTheDocument();
    expect(screen.queryByText("Tech")).not.toBeInTheDocument(); // one tech: nothing to choose
  });

  it("draws nothing when nobody has clients or techs", () => {
    const { container } = render(
      <CalendarSidebarFacets users={[person(1, [], [])]} selection={NO_FACETS} onChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("reports the new selection when a chip is pressed, and clears it when pressed again", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CalendarSidebarFacets users={users} selection={NO_FACETS} onChange={onChange} />
    );
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: /Acme/ }));
    expect(onChange).toHaveBeenLastCalledWith({ client: "10", tech: null });

    rerender(
      <CalendarSidebarFacets
        users={users}
        selection={{ client: "10", tech: null }}
        onChange={onChange}
      />
    );
    expect(screen.getByRole("button", { name: /Acme/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Acme/ }));
    expect(onChange).toHaveBeenLastCalledWith(NO_FACETS);
  });

  it("renders event type toggles when onToggleType is provided and fires callback", () => {
    const onToggleType = vi.fn();
    render(
      <CalendarSidebarFacets
        users={users}
        selection={NO_FACETS}
        onChange={vi.fn()}
        showStandby={true}
        showVacation={true}
        showSick={true}
        onToggleType={onToggleType}
      />
    );
    openFilters();
    expect(screen.getByText("Legend / Event Types")).toBeInTheDocument();
    const vacationBtn = screen.getByRole("button", { name: /Vacation/ });
    expect(vacationBtn).toBeInTheDocument();
    fireEvent.click(vacationBtn);
    expect(onToggleType).toHaveBeenCalledWith("vacation");
  });

  it("opens automatically and shows active count when a type filter is disabled", () => {
    render(
      <CalendarSidebarFacets
        users={users}
        selection={NO_FACETS}
        onChange={vi.fn()}
        showStandby={true}
        showVacation={true}
        showSick={false}
        onToggleType={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /^Filters \(1\)/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });
});
