import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityTimeline } from "./ActivityTimeline";

vi.mock("@/lib/date-format-utils", () => ({
  formatDateTime: (value: string | null) =>
    value === "2026-08-17T09:31:01.849Z" ? "17/08/2026 09:31" : "",
}));

const ITEM = {
  id: "leave-1",
  user: "elencio.mukaj",
  action: "requested vacation",
  target: "3d",
  timestamp: "2026-08-17T09:31:01.849Z",
  status: "pending",
} as const;

describe("ActivityTimeline", () => {
  it("renders the formatted timestamp instead of the raw ISO string", () => {
    render(<ActivityTimeline items={[{ ...ITEM }]} />);
    expect(screen.queryByText("2026-08-17T09:31:01.849Z")).not.toBeInTheDocument();
    expect(screen.getByText("17/08/2026 09:31")).toBeInTheDocument();
  });

  it("falls back to the raw timestamp when formatting yields nothing", () => {
    render(<ActivityTimeline items={[{ ...ITEM, id: "leave-2", timestamp: "not-a-date" }]} />);
    expect(screen.getByText("not-a-date")).toBeInTheDocument();
  });
});
