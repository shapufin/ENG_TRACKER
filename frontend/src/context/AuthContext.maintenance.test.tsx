import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./AuthContext";

vi.mock("@/services/authService", () => ({
  authService: {
    refreshToken: vi.fn(),
    getCurrentUser: vi.fn(),
    logout: vi.fn(),
  },
}));

import { authService } from "@/services/authService";

const maintenanceError = () => ({
  isAxiosError: true,
  response: { status: 503, data: { code: "maintenance" } },
});

const Probe = () => {
  const { user, isLoading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="user">{user?.username ?? "none"}</span>
    </div>
  );
};

const renderProvider = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  localStorage.clear();
  vi.mocked(authService.refreshToken).mockReset();
  vi.mocked(authService.getCurrentUser).mockReset();
  vi.mocked(authService.logout).mockReset();
  localStorage.setItem("user", JSON.stringify({ id: 7, username: "employee" }));
});

describe("AuthContext bootstrap during maintenance", () => {
  it("keeps the stored session when the refresh is refused by maintenance", async () => {
    vi.mocked(authService.refreshToken).mockRejectedValue(maintenanceError());

    renderProvider();

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("user")).toHaveTextContent("employee");
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it("still clears a genuinely invalid session", async () => {
    vi.mocked(authService.refreshToken).mockRejectedValue({
      isAxiosError: true,
      response: { status: 401, data: { detail: "invalid" } },
    });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(authService.logout).toHaveBeenCalled();
  });
});
