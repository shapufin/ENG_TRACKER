import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstallAppNotice } from "./InstallAppNotice";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const promptInstall = vi.fn();
const dismiss = vi.fn();

vi.mock("@/hooks/useInstallPrompt", () => ({
  useInstallPrompt: vi.fn(() => ({
    isIOS: false,
    isFirefox: false,
    isStandalone: false,
    isInstallable: true,
    canShowInstallGuidance: true,
    canShowInstallButton: true,
    promptInstall,
    dismiss,
  })),
}));

describe("InstallAppNotice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers the browser install action and supports dismissal", () => {
    render(<InstallAppNotice />);

    expect(screen.getByText(/install engineering tracker/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /install app/i }));
    fireEvent.click(screen.getByRole("button", { name: /dismiss install prompt/i }));

    expect(promptInstall).toHaveBeenCalledOnce();
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("shows iOS installation instructions", async () => {
    vi.mocked(useInstallPrompt).mockReturnValue({
      isIOS: true,
      isFirefox: false,
      isStandalone: false,
      isInstallable: false,
      canShowInstallGuidance: true,
      canShowInstallButton: true,
      promptInstall,
      dismiss,
    });

    render(<InstallAppNotice />);
    fireEvent.click(screen.getByRole("button", { name: /how to install/i }));

    expect(screen.getByText("Add to Home Screen")).toBeInTheDocument();
  });
});
