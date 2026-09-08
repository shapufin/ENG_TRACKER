import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwitchField } from "./SwitchField";

describe("SwitchField", () => {
  it("renders a switch associated with its label text", () => {
    render(
      <SwitchField
        id="notify"
        label="Email notifications"
        description="Receive a digest every Monday."
        checked={false}
        onCheckedChange={() => {}}
      />
    );

    // Accessible name comes from the associated <Label htmlFor>.
    const toggle = screen.getByRole("switch", { name: "Email notifications" });
    expect(toggle).not.toBeChecked();

    expect(screen.getByText("Receive a digest every Monday.")).toBeInTheDocument();
  });

  it("renders the description when provided", () => {
    render(
      <SwitchField
        id="notify"
        label="Email notifications"
        description="Receive a digest every Monday."
        checked={false}
        onCheckedChange={() => {}}
      />
    );

    expect(screen.getByText("Receive a digest every Monday.")).toBeInTheDocument();
  });

  it("does not render a description when omitted", () => {
    render(
      <SwitchField
        id="notify"
        label="Email notifications"
        checked={false}
        onCheckedChange={() => {}}
      />
    );

    expect(screen.queryByText(/digest/)).not.toBeInTheDocument();
  });

  it("fires onCheckedChange when the switch is toggled", () => {
    const onCheckedChange = vi.fn();
    render(
      <SwitchField
        id="notify"
        label="Email notifications"
        checked={false}
        onCheckedChange={onCheckedChange}
      />
    );

    fireEvent.click(screen.getByRole("switch", { name: "Email notifications" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
