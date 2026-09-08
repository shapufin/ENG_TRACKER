import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ControlRoomEmptyState } from "./ControlRoomEmptyState";

describe("ControlRoomEmptyState modernization", () => {
  it("uses the shared icon-centered empty state surface", () => {
    const { container } = render(<ControlRoomEmptyState reason="no_data" />);

    expect(screen.getByText("No Standby Data")).toBeInTheDocument();
    expect(container.querySelector(".shadow-glass")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
