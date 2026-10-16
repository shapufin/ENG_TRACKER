import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UserStatsStrip } from "./UserStatsStrip";

const stats = {
  total_users: 12,
  italian_tl_count: 3,
  albanian_tl_count: 2,
  no_tl_count: 1,
  active_today_count: 9,
};

const renderStrip = (over: Partial<Parameters<typeof UserStatsStrip>[0]> = {}) => {
  const props = {
    stats,
    noTechCount: 4,
    tlFilter: "employee" as const,
    noTechOnly: false,
    onTlFilterToggle: vi.fn(),
    onNoTechToggle: vi.fn(),
    ...over,
  };
  render(<UserStatsStrip {...props} />);
  return props;
};

describe("UserStatsStrip", () => {
  it("shows every headline count with its label", () => {
    renderStrip();
    const pairs: [string, string][] = [
      ["Total users", "12"],
      ["Italian TL", "3"],
      ["Albanian TL", "2"],
      ["No TL", "1"],
      ["No Tech", "4"],
      ["Active today", "9"],
    ];
    for (const [label, value] of pairs) {
      expect(screen.getByText(label).nextElementSibling).toHaveTextContent(value);
    }
  });

  it("makes Italian TL, Albanian TL and No Tech toggles and leaves the rest static", () => {
    renderStrip();
    for (const name of ["Italian TL", "Albanian TL", "No Tech"]) {
      expect(screen.getByRole("button", { name: new RegExp(name) })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    }
    expect(screen.queryByRole("button", { name: /Total users/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /No TL/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Active today/ })).toBeNull();
  });

  it("reports the pressed state and forwards clicks", () => {
    const props = renderStrip({ tlFilter: "albanian_tl", noTechOnly: true });
    expect(screen.getByRole("button", { name: /Albanian TL/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /No Tech/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Italian TL/ }));
    expect(props.onTlFilterToggle).toHaveBeenCalledWith("italian_tl");
    fireEvent.click(screen.getByRole("button", { name: /No Tech/ }));
    expect(props.onNoTechToggle).toHaveBeenCalled();
  });
});
