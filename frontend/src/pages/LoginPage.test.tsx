import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LoginPage } from "./LoginPage";

// Mock AuthContext
const loginMock = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ login: loginMock }),
}));

// Mock framer-motion to avoid animation delays in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
  useReducedMotion: () => false,
}));

// Track navigate calls — each test overrides the mock to capture its own
// navigate function. We use a module-level variable so the hoisted mock
// can reference it.
let navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function submitLogin() {
  fireEvent.change(screen.getByLabelText(/username/i), {
    target: { value: "testuser" },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: "pass123" },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("LoginPage redirect logic", () => {
  beforeEach(() => {
    loginMock.mockReset();
    navigateMock = vi.fn();
  });

  it("redirects staff (non-superuser) to /admin, not /admin/users", async () => {
    // is_cr_admin() returns True for is_staff users (hierarchy), so the
    // login response has is_cr_admin=true. Without an is_staff check
    // before the is_cr_admin branch, staff users would be redirected to
    // /admin/users instead of /admin.
    loginMock.mockResolvedValue({
      access: "a",
      refresh: "r",
      user: {
        id: 1,
        username: "staff",
        is_superuser: false,
        is_staff: true,
        is_cr_admin: true, // is_cr_admin() returns True for is_staff
      },
    });
    renderPage();
    await submitLogin();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/admin"));
  });

  it("redirects CR-only admin (not staff) to /admin/users", async () => {
    loginMock.mockResolvedValue({
      access: "a",
      refresh: "r",
      user: {
        id: 2,
        username: "cradmin",
        is_superuser: false,
        is_staff: false,
        is_cr_admin: true,
      },
    });
    renderPage();
    await submitLogin();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/admin/users"));
  });

  it("redirects CR user to /control-room/dashboard", async () => {
    loginMock.mockResolvedValue({
      access: "a",
      refresh: "r",
      user: {
        id: 3,
        username: "cruser",
        is_superuser: false,
        is_staff: false,
        is_cr_admin: false,
        has_control_room_access: true,
      },
    });
    renderPage();
    await submitLogin();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/control-room/dashboard"));
  });

  it("redirects regular employee to /dashboard", async () => {
    loginMock.mockResolvedValue({
      access: "a",
      refresh: "r",
      user: {
        id: 4,
        username: "emp",
        is_superuser: false,
        is_staff: false,
        is_cr_admin: false,
        has_control_room_access: false,
      },
    });
    renderPage();
    await submitLogin();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/dashboard"));
  });
});
