import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePushNotifications } from "./usePushNotifications";

// Mock the API module
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import api from "@/lib/api";

describe("usePushNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: unsupported environment
    vi.stubGlobal("Notification", undefined);
    // jsdom doesn't have matchMedia; stub it with a no-op implementation.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns unsupported when PushManager is not available", () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isSupported).toBe(false);
    expect(result.current.permission).toBe("unsupported");
  });

  it("returns supported when serviceWorker and PushManager exist", () => {
    vi.stubGlobal("Notification", { permission: "default" });
    vi.stubGlobal("PushManager", {});
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: () => Promise.resolve(null),
          },
        }),
      },
    });

    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isSupported).toBe(true);
  });

  it("requestPermission returns false when unsupported", async () => {
    const { result } = renderHook(() => usePushNotifications());
    let success;
    await act(async () => {
      success = await result.current.requestPermission();
    });
    expect(success).toBe(false);
  });

  it("subscribe returns false when not supported", async () => {
    const { result } = renderHook(() => usePushNotifications());
    let success;
    await act(async () => {
      success = await result.current.subscribe();
    });
    expect(success).toBe(false);
  });

  it("unsubscribe returns false when not supported", async () => {
    const { result } = renderHook(() => usePushNotifications());
    let success;
    await act(async () => {
      success = await result.current.unsubscribe();
    });
    expect(success).toBe(false);
  });

  it("subscribe calls API and returns true on success", async () => {
    vi.stubGlobal("Notification", { permission: "granted" });
    vi.stubGlobal("PushManager", {});
    const mockSubscribe = vi.fn().mockResolvedValue({
      endpoint: "https://fcm.googleapis.com/test",
      getKey: (key: string) => `mock_${key}`,
    });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            subscribe: mockSubscribe,
            getSubscription: () => Promise.resolve(null),
          },
        }),
      },
    });

    vi.mocked(api.get).mockResolvedValue({ data: { public_key: "test_key" } });
    vi.mocked(api.post).mockResolvedValue({});

    const { result } = renderHook(() => usePushNotifications());

    // Wait for supported state to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let success;
    await act(async () => {
      success = await result.current.subscribe();
    });

    expect(success).toBe(true);
    expect(api.get).toHaveBeenCalled();
    expect(api.post).toHaveBeenCalled();
    expect(result.current.isSubscribed).toBe(true);
  });

  it("exposes isSubscribing loading state during subscribe", async () => {
    vi.stubGlobal("Notification", { permission: "granted" });
    vi.stubGlobal("PushManager", {});
    let resolveSubscribe: (value: unknown) => void = () => {};
    const mockSubscribe = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveSubscribe = resolve;
      })
    );
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            subscribe: mockSubscribe,
            getSubscription: () => Promise.resolve(null),
          },
        }),
      },
    });

    vi.mocked(api.get).mockResolvedValue({ data: { public_key: "test_key" } });

    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let subscribePromise: Promise<boolean>;
    act(() => {
      subscribePromise = result.current.subscribe();
    });

    expect(result.current.isSubscribing).toBe(true);

    await act(async () => {
      resolveSubscribe({
        endpoint: "https://fcm.googleapis.com/test",
        getKey: () => "mock_key",
      });
      await subscribePromise;
    });

    expect(result.current.isSubscribing).toBe(false);
  });

  it("sets error state when subscribe fails", async () => {
    vi.stubGlobal("Notification", { permission: "granted" });
    vi.stubGlobal("PushManager", {});
    const mockSubscribe = vi.fn().mockRejectedValue(new Error("SW error"));
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            subscribe: mockSubscribe,
            getSubscription: () => Promise.resolve(null),
          },
        }),
      },
    });

    vi.mocked(api.get).mockResolvedValue({ data: { public_key: "test_key" } });

    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let success;
    await act(async () => {
      success = await result.current.subscribe();
    });

    expect(success).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(result.current.isSubscribing).toBe(false);
  });

  it("clears error on successful subscribe after failure", async () => {
    vi.stubGlobal("Notification", { permission: "granted" });
    vi.stubGlobal("PushManager", {});
    const mockSubscribe = vi
      .fn()
      .mockRejectedValueOnce(new Error("SW error"))
      .mockResolvedValueOnce({
        endpoint: "https://fcm.googleapis.com/test",
        getKey: () => "mock_key",
      });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            subscribe: mockSubscribe,
            getSubscription: () => Promise.resolve(null),
          },
        }),
      },
    });

    vi.mocked(api.get).mockResolvedValue({ data: { public_key: "test_key" } });
    vi.mocked(api.post).mockResolvedValue({});

    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.subscribe();
    });
    expect(result.current.error).toBeTruthy();

    await act(async () => {
      await result.current.subscribe();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isSubscribed).toBe(true);
  });

  it("exposes denied permission state for browser-settings recovery", async () => {
    vi.stubGlobal("Notification", {
      permission: "denied",
      requestPermission: vi.fn().mockResolvedValue("denied"),
    });
    vi.stubGlobal("PushManager", {});
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: () => Promise.resolve(null),
          },
        }),
      },
    });

    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.permission).toBe("denied");

    let success;
    await act(async () => {
      success = await result.current.subscribe();
    });

    expect(success).toBe(false);
    expect(result.current.permission).toBe("denied");
  });

  it("exposes pushAvailability=unsupported when PushManager is missing", () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.pushAvailability).toBe("unsupported");
  });

  it("exposes pushAvailability=available on desktop Chrome (non-iOS, supported)", async () => {
    vi.stubGlobal("Notification", { permission: "default" });
    vi.stubGlobal("PushManager", {});
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
      platform: "Win32",
      maxTouchPoints: 0,
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: () => Promise.resolve(null),
          },
        }),
      },
    });

    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.pushAvailability).toBe("available");
  });

  it("exposes pushAvailability=installed-required on iOS Safari (not standalone)", async () => {
    vi.stubGlobal("Notification", { permission: "default" });
    vi.stubGlobal("PushManager", {});
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 1,
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: () => Promise.resolve(null),
          },
        }),
      },
    });

    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.pushAvailability).toBe("installed-required");
  });

  it("exposes pushAvailability=available on iOS Safari in standalone mode", async () => {
    vi.stubGlobal("Notification", { permission: "default" });
    vi.stubGlobal("PushManager", {});
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(display-mode: standalone)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 1,
      standalone: true,
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: () => Promise.resolve(null),
          },
        }),
      },
    });

    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.pushAvailability).toBe("available");
  });
});
