import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInstallPrompt } from "./useInstallPrompt";

function createInstallEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, {
    prompt: vi.fn(),
    userChoice: Promise.resolve({ outcome }),
  });
  return event;
}

describe("useInstallPrompt", () => {
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: originalUserAgent.replace(/iPhone|iPad|iPod/gi, "Desktop"),
    });
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("captures the browser install event and prompts from the returned action", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = createInstallEvent();

    act(() => window.dispatchEvent(event));

    await waitFor(() => expect(result.current.isInstallable).toBe(true));
    await act(async () => {
      await expect(result.current.promptInstall()).resolves.toBe(true);
    });

    expect((event as Event & { prompt: ReturnType<typeof vi.fn> }).prompt).toHaveBeenCalledOnce();
    expect(result.current.isInstallable).toBe(false);
  });

  it("supports iOS installation guidance without a browser prompt", async () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    });
    const { result } = renderHook(() => useInstallPrompt());

    await waitFor(() => expect(result.current.isIOS).toBe(true));
    expect(result.current.canShowInstallGuidance).toBe(true);
    await expect(result.current.promptInstall()).resolves.toBe(false);
  });

  it("does not offer installation while running standalone", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(display-mode: standalone)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { result } = renderHook(() => useInstallPrompt());

    await waitFor(() => expect(result.current.isStandalone).toBe(true));
    expect(result.current.isInstallable).toBe(false);
    expect(result.current.canShowInstallGuidance).toBe(false);
  });

  it("persists a dismissed browser prompt", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => window.dispatchEvent(createInstallEvent("dismissed")));
    await waitFor(() => expect(result.current.isInstallable).toBe(true));

    act(() => result.current.dismiss());

    expect(result.current.isInstallable).toBe(false);
    expect(localStorage.getItem("engtracker:pwa-install-dismissed:v1")).toBe("1");
  });

  it("exposes canShowInstallButton on Firefox (no beforeinstallprompt)", () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
    });
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.isFirefox).toBe(true);
    expect(result.current.isInstallable).toBe(false);
    expect(result.current.canShowInstallGuidance).toBe(false);
    expect(result.current.canShowInstallButton).toBe(true);
  });

  it("exposes canShowInstallButton on desktop Chrome even without beforeinstallprompt", () => {
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.isFirefox).toBe(false);
    expect(result.current.isIOS).toBe(false);
    expect(result.current.isInstallable).toBe(false);
    expect(result.current.canShowInstallGuidance).toBe(false);
    // Sidebar button shows regardless — it's a persistent entry point
    expect(result.current.canShowInstallButton).toBe(true);
  });

  it("hides canShowInstallButton when already in standalone mode", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(display-mode: standalone)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { result } = renderHook(() => useInstallPrompt());

    await waitFor(() => expect(result.current.isStandalone).toBe(true));
    expect(result.current.canShowInstallButton).toBe(false);
  });

  it("does not crash when window.matchMedia is unavailable (jsdom/SSR)", () => {
    // jsdom does not implement matchMedia. The hook must degrade gracefully
    // instead of throwing — Sidebar/AdminSidebar tests render the hook via
    // SidebarInstallButton without mocking matchMedia.
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.isStandalone).toBe(false);
    expect(result.current.canShowInstallButton).toBe(true);
  });
});
