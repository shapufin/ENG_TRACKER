import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OvertimeHoursBadge } from "./OvertimeHoursBadge";

const entry = (over: Partial<Parameters<typeof OvertimeHoursBadge>[0]["log"]>) => ({
  hours: 1,
  paid_window_start: null,
  paid_window_end: null,
  ...over,
});

describe("OvertimeHoursBadge", () => {
  it("shows whole hours without decimals", () => {
    render(<OvertimeHoursBadge log={entry({ hours: 2 })} />);
    expect(screen.getByText("2h")).toBeInTheDocument();
  });

  it("shows a shared half hour and the block it belongs to", () => {
    render(
      <OvertimeHoursBadge
        log={entry({ hours: 0.5, paid_window_start: "08:00:00", paid_window_end: "09:00:00" })}
      />
    );
    expect(screen.getByText("0.5h")).toBeInTheDocument();
    expect(screen.getByText("Block 08:00-09:00")).toBeInTheDocument();
  });

  it("labels an entry whose hour is already covered by another entry", () => {
    render(
      <OvertimeHoursBadge
        log={entry({ hours: 0, paid_window_start: "08:00:00", paid_window_end: "09:00:00" })}
      />
    );
    expect(screen.getByText("0h")).toBeInTheDocument();
    expect(screen.getByText("Covered by 08:00-09:00")).toBeInTheDocument();
  });

  it("hides hundredths noise", () => {
    render(<OvertimeHoursBadge log={entry({ hours: 0.1700000001 })} />);
    expect(screen.getByText("0.17h")).toBeInTheDocument();
  });
});
