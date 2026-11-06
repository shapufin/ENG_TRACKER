import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({ getFreshAccessToken: vi.fn() }));

import { getFreshAccessToken } from "@/lib/api";
import { fetchQueuedMutation } from "./useOfflineStatus";

describe("fetchQueuedMutation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("sends the in-memory access token, not a localStorage one", async () => {
    vi.mocked(getFreshAccessToken).mockResolvedValue("mem-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await fetchQueuedMutation("/x/", { method: "POST" });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer mem-token");
  });

  it("omits Authorization when no token is available", async () => {
    vi.mocked(getFreshAccessToken).mockResolvedValue(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await fetchQueuedMutation("/x/", { method: "POST" });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
