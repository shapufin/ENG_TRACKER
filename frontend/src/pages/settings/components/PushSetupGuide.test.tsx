import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { PushSetupGuide } from "./PushSetupGuide";

describe("PushSetupGuide", () => {
  it("opens on the iPhone steps when told to, with the Home Screen requirement first", () => {
    render(<PushSetupGuide defaultTab="ios" />);
    expect(screen.getByRole("tab", { name: "iPhone", selected: true })).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.getByText(/iOS 16\.4 or later/)).toBeInTheDocument();
    expect(screen.queryByText(/Chrome asks/)).not.toBeInTheDocument();
  });

  it("switches to the Android steps with the blocked-notifications recovery", async () => {
    render(<PushSetupGuide defaultTab="ios" />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Android" }));
    fireEvent.click(screen.getByRole("tab", { name: "Android" }));
    expect(await screen.findByText(/Chrome asks/)).toBeInTheDocument();
    expect(screen.getByText(/lock icon/i)).toBeInTheDocument();
    expect(screen.getByText(/Unrestricted/)).toBeInTheDocument();
  });

  it("always says the QR code works without notifications", () => {
    render(<PushSetupGuide defaultTab="android" />);
    expect(screen.getByText(/QR code/)).toBeInTheDocument();
  });

  it("picks the iPhone tab from the browser when no tab is given", () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      configurable: true,
    });
    render(<PushSetupGuide />);
    expect(screen.getByRole("tab", { name: "iPhone", selected: true })).toBeInTheDocument();
    Object.defineProperty(navigator, "userAgent", { value: original, configurable: true });
  });
});
