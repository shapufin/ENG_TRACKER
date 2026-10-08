import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PeopleMixWidget } from "./PeopleMixWidget";
import { makePeople } from "./adminFixtures";

describe("PeopleMixWidget", () => {
  it("opens on Roles, marked for PDF export", () => {
    const { container } = render(<PeopleMixWidget data={makePeople()} />);
    expect(screen.getByRole("tab", { name: "Roles", selected: true })).toBeInTheDocument();
    expect(container.querySelector("[data-chart-section='people-mix']")).not.toBeNull();
    expect(screen.getByText("Italian TLs").closest("li")).toHaveTextContent("3");
  });

  it("switches to Tech", async () => {
    render(<PeopleMixWidget data={makePeople()} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Tech" }));
    expect(screen.getByRole("group", { name: "NOC" })).toBeInTheDocument();
    expect(screen.queryByText("Italian TLs")).toBeNull();
  });

  it("shows the tech empty state", async () => {
    render(<PeopleMixWidget data={makePeople({ techs: [] })} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Tech" }));
    expect(screen.getByText("No tech assignments yet")).toBeInTheDocument();
  });

  it("shows loading, then an error with a retry", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<PeopleMixWidget isLoading />);
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
    rerender(<PeopleMixWidget isError onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
