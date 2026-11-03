import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EventTooltip } from "./EventTooltip";
import { EventCard } from "./EventCard";
import type { CalendarEvent } from "./types";

const baseEvent: CalendarEvent = {
  id: "sb-1",
  title: "SB: 8h",
  start: "2024-06-15",
  end: "2024-06-15",
  type: "standby",
  status: "approved",
  userId: 1,
  userName: "Alice",
  compactLabel: "Standby (8h)",
};

const renderCard = (overrides: Partial<CalendarEvent> = {}) =>
  render(<EventCard event={{ ...baseEvent, ...overrides } as CalendarEvent} />);

describe("EventCard", () => {
  it("colors a standby event with the standby (amber) type tone", () => {
    const { container } = renderCard();
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-amber-50");
    expect(card.className).toContain("dark:bg-amber-950/30");
  });

  it("colors a vacation event with the vacation (emerald) type tone", () => {
    const { container } = renderCard({ type: "vacation", status: "approved" });
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-emerald-50");
  });

  it("colors a holiday event with the holiday (sky) type tone", () => {
    const { container } = renderCard({
      type: "holiday",
      status: "approved",
      title: "Christmas",
    });
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-sky-50");
  });

  it("renders a holiday event with calendar icon and holiday title without user initials", () => {
    renderCard({
      type: "holiday",
      status: "approved",
      title: "Independence Day",
    });
    expect(screen.getByText("Independence Day")).toBeInTheDocument();
    expect(screen.queryByText("ID")).toBeNull();
  });

  it("shows the pending indicator dot only for pending events", () => {
    const { container, unmount } = renderCard({ status: "pending" });
    expect(container.querySelector('[title="Pending approval"]')).not.toBeNull();
    unmount();

    const approved = renderCard({ status: "approved" });
    expect(approved.container.querySelector('[title="Pending approval"]')).toBeNull();
  });

  it("renders the compact label", () => {
    renderCard();
    expect(screen.getByText("Standby (8h)")).toBeInTheDocument();
  });

  it("shows client names in a standby event's compact label", () => {
    renderCard({
      clientNames: ["Acme Corp", "Globex"],
      compactLabel: "Standby (8h) · Acme Corp, Globex",
    });
    expect(screen.getByText("Standby (8h) · Acme Corp, Globex")).toBeInTheDocument();
  });

  it("renders a streamlined single-row pill when density is compact", () => {
    render(<EventCard event={{ ...baseEvent, days: 3 }} density="compact" />);
    expect(screen.getByText("Standby")).toBeInTheDocument();
    expect(screen.getByText("3d")).toBeInTheDocument();
  });

  it("keeps the quantity visible in compact mode when the label truncates", () => {
    render(
      <EventCard
        event={{
          ...baseEvent,
          // The API serialises decimals as strings.
          hours: "8.00" as unknown as number,
          clientNames: ["Acme Corp"],
          compactLabel: "Standby (8h) · Acme Corp",
        }}
        density="compact"
      />
    );
    // Quantity moves to its own non-truncating chip; the full label stays in the tooltip.
    expect(screen.getByText("8h")).toBeInTheDocument(); // "8.00" is shown without trailing zeros
    expect(screen.getByText("Standby · Acme Corp")).toHaveAttribute(
      "title",
      "Standby (8h) · Acme Corp"
    );
  });

  it("keeps only the initials in a narrow cell so the pill never overflows it", () => {
    render(
      <EventCard
        event={{ ...baseEvent, hours: "1.00" as unknown as number, status: "pending" }}
        density="compact"
      />
    );
    // Container-query classes: no effect without a container, so Week/List keep the full pill.
    for (const el of [
      screen.getByText("Standby"),
      screen.getByText("1h"),
      screen.getByTitle("Pending approval"),
    ]) {
      expect(el.className).toContain("@max-[5rem]:hidden");
    }
  });

  it("still activates when a Radix tooltip trigger injects its own onClick", () => {
    // The trigger's props are spread onto the pill; they used to replace the pill's own click handler.
    const onEventActivate = vi.fn();
    render(
      <TooltipProvider>
        <EventTooltip event={baseEvent} onEventActivate={onEventActivate}>
          <EventCard event={baseEvent} />
        </EventTooltip>
      </TooltipProvider>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onEventActivate).toHaveBeenCalledWith(baseEvent);
  });
});
