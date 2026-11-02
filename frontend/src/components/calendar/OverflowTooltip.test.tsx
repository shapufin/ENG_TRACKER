import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OverflowTooltip } from "./OverflowTooltip";
import type { CalendarEvent } from "./types";

const hidden = [
  { id: "a", type: "vacation", userName: "Alice Smith", title: "Vac: 3d" },
  { id: "b", type: "standby", userName: "Bob Jones", title: "Standby" },
] as CalendarEvent[];

describe("OverflowTooltip", () => {
  it("lists everyone the +N more button is hiding, with their type", () => {
    render(
      <OverflowTooltip events={hidden} dateLabel="Nov 17" delayDuration={0}>
        <button>+2 more</button>
      </OverflowTooltip>
    );
    fireEvent.focus(screen.getByRole("button", { name: "+2 more" }));
    expect(screen.getAllByText("2 more on Nov 17").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Alice Smith").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bob Jones").length).toBeGreaterThan(0);
    expect(screen.getAllByText("standby").length).toBeGreaterThan(0);
  });
});
