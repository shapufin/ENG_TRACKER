import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./AuthContext";

vi.mock("@/services/authService", () => ({
  authService: {
    refreshToken: vi.fn().mockResolvedValue({ access: "t" }),
    getCurrentUser: vi.fn().mockResolvedValue({ id: 7, username: "employee" }),
    logout: vi.fn(),
  },
}));
vi.mock("@/lib/offline/offlineQueue", () => ({ getQueueCount: vi.fn() }));

import { authService } from "@/services/authService";
import { getQueueCount } from "@/lib/offline/offlineQueue";

const after = vi.fn();
const Probe = () => {
  const { requestLogout, isLoading } = useAuth();
  if (isLoading) return null;
  return <button onClick={() => requestLogout(after)}>Log out now</button>;
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
  localStorage.setItem("user", JSON.stringify({ id: 7, username: "employee" }));
  vi.mocked(authService.logout).mockClear();
  after.mockClear();
});

describe("requestLogout with unsent offline changes (audit H1)", () => {
  it("logs out at once when nothing is waiting to be sent", async () => {
    vi.mocked(getQueueCount).mockReturnValue(0);
    renderProvider();
    fireEvent.click(await screen.findByRole("button", { name: "Log out now" }));
    expect(authService.logout).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("asks first, naming the number of unsent changes, and keeps the session on Cancel", async () => {
    vi.mocked(getQueueCount).mockReturnValue(3);
    renderProvider();
    fireEvent.click(await screen.findByRole("button", { name: "Log out now" }));
    expect(await screen.findByText(/3 unsent changes/i)).toBeInTheDocument();
    expect(authService.logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByText(/unsent changes/i)).not.toBeInTheDocument());
    expect(authService.logout).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("logs out and discards the changes only after the user confirms", async () => {
    vi.mocked(getQueueCount).mockReturnValue(1);
    renderProvider();
    fireEvent.click(await screen.findByRole("button", { name: "Log out now" }));
    expect(await screen.findByText(/1 unsent change\b/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /log out anyway/i }));
    await waitFor(() => expect(authService.logout).toHaveBeenCalledTimes(1));
    expect(after).toHaveBeenCalledTimes(1);
  });
});
