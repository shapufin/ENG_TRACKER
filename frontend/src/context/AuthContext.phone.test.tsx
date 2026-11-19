import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { collectPhoneApproval } from "@/services/phoneApprovalService";

vi.mock("@/services/phoneApprovalService", () => ({ collectPhoneApproval: vi.fn() }));

const collect = vi.mocked(collectPhoneApproval);

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AuthProvider>{children}</AuthProvider>
  </QueryClientProvider>
);

describe("AuthContext.completePhoneApproval", () => {
  beforeEach(() => {
    localStorage.clear();
    collect.mockReset();
  });

  it("returns a waiting status without starting a session", async () => {
    collect.mockResolvedValue({ status: "pending" });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let answer: unknown;
    await act(async () => {
      answer = await result.current.completePhoneApproval("tok", "r1", "key");
    });
    expect(answer).toEqual({ status: "pending" });
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
  });

  it("starts the session once the phone approved", async () => {
    collect.mockResolvedValue({ access: "a", user: { id: 1, username: "ann" } } as never);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.completePhoneApproval("tok", "r1", "key");
    });
    expect(result.current.user).toMatchObject({ username: "ann" });
    expect(result.current.isAuthenticated).toBe(true);
  });
});
