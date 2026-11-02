import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConflictTooltip } from "./ConflictTooltip";

const conflict = {
  dateKey: "2026-11-17",
  coveragePct: 50,
  away: 2,
  total: 4,
  users: [
    { id: 1, name: "Alice Smith", type: "vacation" as const, status: "approved" as const },
    { id: 2, name: "Bob Jones", type: "sick" as const, status: "approved" as const },
  ],
};

describe("ConflictTooltip", () => {
  it("explains the conflict: capacity and who is away", () => {
    render(
      <ConflictTooltip conflict={conflict} delayDuration={0}>
        <span aria-label="badge" tabIndex={0} />
      </ConflictTooltip>
    );
    fireEvent.focus(screen.getByLabelText("badge"));
    expect(screen.getAllByText("Coverage conflict").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/50% on duty/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Alice Smith, Bob Jones/).length).toBeGreaterThan(0);
  });
});
