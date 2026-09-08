import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarInstallButton } from "./SidebarInstallButton";

// Mock useInstallPrompt
vi.mock("@/hooks/useInstallPrompt", () => ({
  useInstallPrompt: vi.fn(),
}));

import { useInstallPrompt } from "@/hooks/useInstallPrompt";

describe("SidebarInstallButton", () => {
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: originalUserAgent.replace(/iPhone|iPad|iPod/gi, "Desktop"),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when canShowInstallButton is false", () => {
    vi.mocked(useInstallPrompt).mockReturnValue({
      isIOS: false,
      isFirefox: false,
      isStandalone: true,
      isInstallable: false,
      canShowInstallGuidance: false,
      canShowInstallButton: false,
      promptInstall: vi.fn(),
      dismiss: vi.fn(),
    });

    render(<SidebarInstallButton collapsed={false} />);
    expect(screen.queryByLabelText("Install app")).not.toBeInTheDocument();
  });

  it("renders install button when canShowInstallButton is true", () => {
    vi.mocked(useInstallPrompt).mockReturnValue({
      isIOS: false,
      isFirefox: false,
      isStandalone: false,
      isInstallable: true,
      canShowInstallGuidance: true,
      canShowInstallButton: true,
      promptInstall: vi.fn().mockResolvedValue(true),
      dismiss: vi.fn(),
    });

    render(<SidebarInstallButton collapsed={false} />);
    expect(screen.getByLabelText("Install app")).toBeInTheDocument();
    expect(screen.getByText("Install app")).toBeInTheDocument();
  });

  it("calls promptInstall on click when installable", () => {
    const promptInstall = vi.fn().mockResolvedValue(true);
    vi.mocked(useInstallPrompt).mockReturnValue({
      isIOS: false,
      isFirefox: false,
      isStandalone: false,
      isInstallable: true,
      canShowInstallGuidance: true,
      canShowInstallButton: true,
      promptInstall,
      dismiss: vi.fn(),
    });

    render(<SidebarInstallButton collapsed={false} />);
    fireEvent.click(screen.getByLabelText("Install app"));
    expect(promptInstall).toHaveBeenCalledOnce();
  });

  it("shows iOS instructions dialog when not installable and iOS", () => {
    vi.mocked(useInstallPrompt).mockReturnValue({
      isIOS: true,
      isFirefox: false,
      isStandalone: false,
      isInstallable: false,
      canShowInstallGuidance: true,
      canShowInstallButton: true,
      promptInstall: vi.fn(),
      dismiss: vi.fn(),
    });

    render(<SidebarInstallButton collapsed={false} />);
    fireEvent.click(screen.getByLabelText("Install app"));

    expect(screen.getByText("Add to Home Screen")).toBeInTheDocument();
  });

  it("shows Firefox guidance dialog when not installable and Firefox", () => {
    vi.mocked(useInstallPrompt).mockReturnValue({
      isIOS: false,
      isFirefox: true,
      isStandalone: false,
      isInstallable: false,
      canShowInstallGuidance: false,
      canShowInstallButton: true,
      promptInstall: vi.fn(),
      dismiss: vi.fn(),
    });

    render(<SidebarInstallButton collapsed={false} />);
    fireEvent.click(screen.getByLabelText("Install app"));

    expect(screen.getByText(/Chrome/)).toBeInTheDocument();
    expect(screen.getByText(/Install site as app/)).toBeInTheDocument();
  });

  it("renders icon-only when collapsed", () => {
    vi.mocked(useInstallPrompt).mockReturnValue({
      isIOS: false,
      isFirefox: false,
      isStandalone: false,
      isInstallable: true,
      canShowInstallGuidance: true,
      canShowInstallButton: true,
      promptInstall: vi.fn().mockResolvedValue(true),
      dismiss: vi.fn(),
    });

    render(<SidebarInstallButton collapsed={true} />);
    expect(screen.getByLabelText("Install app")).toBeInTheDocument();
    expect(screen.queryByText("Install app")).not.toBeInTheDocument();
  });
});
