import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./AuthContext";
import type { ReactNode } from "react";

describe("AuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };

  const renderAuthHook = async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    return result;
  };

  it("should provide unauthenticated state after bootstrap", async () => {
    const result = await renderAuthHook();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("should have login function", async () => {
    const result = await renderAuthHook();
    expect(typeof result.current.login).toBe("function");
  });

  it("should have logout function", async () => {
    const result = await renderAuthHook();
    expect(typeof result.current.logout).toBe("function");
  });
});
