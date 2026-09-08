import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HolidayTable } from "./HolidayTable";
import type { PublicHoliday } from "@/types";

vi.mock("@/components/ui/LoadingCard", () => ({
  LoadingCard: ({ className }: { className?: string }) => (
    <div data-testid="loading-card" className={className} />
  ),
}));

const holidays = [
  {
    id: 1,
    name: "New Year",
    formattedDate: "2026-01-01",
    country_code: "US",
    is_global: true,
    scope: "Global",
  },
];

const handlers = {
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

describe("HolidayTable modernization", () => {
  it("does not use rounded-3xl on empty state or wrapper", () => {
    const { container } = render(<HolidayTable holidays={[]} isLoading={false} {...handlers} />);
    expect(container.querySelectorAll(".rounded-3xl").length).toBe(0);
  });

  it("does not use rounded-3xl when rendering rows", () => {
    const { container } = render(
      <HolidayTable holidays={holidays} isLoading={false} {...handlers} />
    );
    expect(container.querySelectorAll(".rounded-3xl").length).toBe(0);
  });

  it("empty state uses GlassCard surface", () => {
    render(<HolidayTable holidays={[]} isLoading={false} {...handlers} />);
    expect(screen.getByText("No holidays defined yet.")).toBeInTheDocument();
  });
});
