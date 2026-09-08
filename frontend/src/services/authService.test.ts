import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { authService } from "./authService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
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
