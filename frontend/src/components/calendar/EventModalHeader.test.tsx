import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventModalHeader } from "./EventModalHeader";
import type { CalendarEvent } from "./types";

const base = {
  id: "1",
  type: "vacation",
  status: "approved",
  userName: "Alice Smith",
  title: "Vac: 3d",
} as CalendarEvent;

describe("EventModalHeader", () => {
  it("spells the event type out instead of the pill abbreviation", () => {
    render(<EventModalHeader event={base} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Vacation" })).toBeInTheDocument();
    expect(screen.queryByText("Vac: 3d")).toBeNull();
  });

  it("keeps the event's own title for holidays", () => {
    render(
      <EventModalHeader
        event={{ ...base, type: "holiday", title: "Independence Day" }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { name: "Independence Day" })).toBeInTheDocument();
  });
});
