import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarInstallButton } from "./SidebarInstallButton";

vi.mock("@/hooks/useInstallPrompt", () => ({
  useInstallPrompt: vi.fn(),
}));

import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const mockHook = (overrides = {}) =>
  vi.mocked(useInstallPrompt).mockReturnValue({
    isIOS: true,
    isFirefox: false,
    isStandalone: false,
    isInstallable: false,
    canShowInstallButton: true,
    canShowInstallGuidance: true,
    dismiss: vi.fn(),
    promptInstall: vi.fn(),
    ...overrides,
  });

beforeEach(() => {
  vi.clearAllMocks();
});

// Phase 6 mechanical rollout: guard-only scroll contract on the install dialog.
describe("SidebarInstallButton dialog", () => {
  it("opens the guidance dialog with the scroll contract", () => {
    mockHook();
    render(<SidebarInstallButton collapsed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Install app" }));
    expect(screen.getByText("Install Engineering Tracker")).toBeInTheDocument();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).toContain("max-h-[90vh]");
  });
});
