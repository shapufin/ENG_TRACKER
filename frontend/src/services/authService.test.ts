import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import api from "@/lib/api";
import { authService } from "./authService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
  // Pass-through: the cross-tab refresh lock is covered by src/lib/refreshLock.test.ts.
  withRefreshLock: <T>(task: () => Promise<T>) => task(),
}));

vi.mock("@/lib/offline/offlineQueue", () => ({ clearOfflineUserData: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("authService URL contracts", () => {
  it("login POSTs to /auth/token/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await authService.login({ username: "u", password: "p" });
    expect(api.post).toHaveBeenCalledWith("/auth/token/", { username: "u", password: "p" });
  });

  it("refreshToken POSTs to /auth/token/refresh/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { access: "x" } } as any);
    await authService.refreshToken("refresh-token");
    expect(api.post).toHaveBeenCalledWith("/auth/token/refresh/", {});
  });

  it("getCurrentUser calls /users/users/me/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await authService.getCurrentUser();
    expect(api.get).toHaveBeenCalledWith("/users/users/me/");
  });

  it("never uses /api/ prefix", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    vi.mocked(api.get).mockResolvedValue({ data: {} } as any);
    await authService.login({ username: "u", password: "p" });
    await authService.refreshToken("r");
    await authService.getCurrentUser();
    const calls = vi.mocked(api.post).mock.calls.concat(vi.mocked(api.get).mock.calls);
    calls.forEach((args) => {
      expect(args[0]).not.toMatch(/^\/api\//);
    });
  });
});

// Audit 2026-11-16 H4: a push notice must not outlive the sign-out on a shared browser profile.
describe("logout and the browser push subscription", () => {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", unsubscribe };

  const stubServiceWorker = (sub: unknown) => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: { getSubscription: vi.fn().mockResolvedValue(sub) },
        }),
      },
    });
    (window as unknown as { PushManager: unknown }).PushManager = function PushManager() {};
  };

  afterEach(() => {
    Reflect.deleteProperty(navigator, "serviceWorker");
    Reflect.deleteProperty(window, "PushManager");
  });

  it("tells the server to stop pushing to this browser, then drops the local subscription", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    stubServiceWorker(subscription);

    await authService.logout();

    expect(api.post).toHaveBeenCalledWith("/plugins/notifications/notifications/unsubscribe/", {
      endpoint: subscription.endpoint,
    });
    expect(unsubscribe).toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith("/auth/token/logout/");
  });

  it("still signs out when there is no subscription or the unsubscribe fails", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    stubServiceWorker(null);
    await authService.logout();
    expect(api.post).toHaveBeenCalledWith("/auth/token/logout/");

    vi.mocked(api.post).mockImplementation(((url: string) =>
      url.includes("unsubscribe") ? Promise.reject(new Error("offline")) : Promise.resolve({ data: {} })) as never);
    stubServiceWorker(subscription);
    await expect(authService.logout()).resolves.toBeUndefined();
    expect(api.post).toHaveBeenCalledWith("/auth/token/logout/");
  });

  it("works in a browser without push support", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await expect(authService.logout()).resolves.toBeUndefined();
    expect(api.post).toHaveBeenCalledWith("/auth/token/logout/");
  });
});
