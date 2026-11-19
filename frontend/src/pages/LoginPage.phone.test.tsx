import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LoginPage } from "./LoginPage";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const supported = vi.hoisted(() => ({ value: true }));
vi.mock("@/services/passkeyService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/passkeyService")>()),
  isPasskeySupported: () => supported.value,
}));

const requestPhoneApprovalMock = vi.fn();
vi.mock("@/services/phoneApprovalService", () => ({
  requestPhoneApproval: (...args: unknown[]) => requestPhoneApprovalMock(...args),
}));

const loginMock = vi.fn();
const completeMock = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    login: loginMock,
    verifyMfa: vi.fn(),
    verifyPasskey: vi.fn(),
    completePhoneApproval: completeMock,
    startLoginSetup: vi.fn(),
    finishLoginSetup: vi.fn(),
    finishLoginPasskeySetup: vi.fn(),
  }),
}));

vi.mock("framer-motion", () => ({
  motion: { div: ({ children }: { children: React.ReactNode }) => <div>{children}</div> },
  useReducedMotion: () => false,
}));

let navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

const session = {
  access: "tok",
  user: { id: 1, username: "ann", is_staff: false, is_superuser: false },
};
const started = (over = {}) => ({
  request_id: "r1",
  number: 42,
  collect_key: "key",
  expires_in: 120,
  pushed: true,
  qr_svg: "<svg></svg>",
  approve_url: "https://tracker.example/phone-approve/r1",
  ...over,
});
const challenge = (methods: string[]) => ({ mfa_required: true, mfa_token: "chal", methods });

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

const passwordStep = async () => {
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "ann" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw" } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
  await act(async () => {});
};

const startPhoneApproval = async (over = {}) => {
  requestPhoneApprovalMock.mockResolvedValue(started(over));
  fireEvent.click(screen.getByRole("button", { name: "Approve on my phone" }));
  await act(async () => {});
};

const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe("LoginPage phone approval", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    for (const mock of [loginMock, completeMock, requestPhoneApprovalMock]) mock.mockReset();
    supported.value = true;
    navigateMock = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  it("does not show the phone option when the account has no paired phone", async () => {
    loginMock.mockResolvedValue(challenge(["passkey", "totp"]));
    renderPage();
    await passwordStep();
    expect(screen.queryByRole("button", { name: "Approve on my phone" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use face id or fingerprint/i })).toBeInTheDocument();
  });

  it("offers the phone first and the other options below it", async () => {
    loginMock.mockResolvedValue(challenge(["passkey", "phone", "totp"]));
    renderPage();
    await passwordStep();
    expect(screen.getByRole("button", { name: "Approve on my phone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use my passkey instead" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use a code instead" })).toBeInTheDocument();
  });

  it("sends the request, shows the number and signs in when the phone approves", async () => {
    loginMock.mockResolvedValue(challenge(["phone", "totp"]));
    completeMock.mockResolvedValueOnce({ status: "pending" }).mockResolvedValueOnce(session);
    renderPage();
    await passwordStep();
    await startPhoneApproval();

    expect(requestPhoneApprovalMock).toHaveBeenCalledWith("chal", "push");
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/Check your phone/)).toBeInTheDocument();

    await tick(2000);
    expect(completeMock).toHaveBeenCalledWith("chal", "r1", "key");
    expect(navigateMock).not.toHaveBeenCalled();
    await tick(2000);
    expect(navigateMock).toHaveBeenCalledWith("/dashboard");
  });

  it("shows the QR code at once when the push could not be delivered, and lets the person toggle it", async () => {
    loginMock.mockResolvedValue(challenge(["phone"]));
    completeMock.mockResolvedValue({ status: "pending" });
    renderPage();
    await passwordStep();
    await startPhoneApproval({ pushed: false });
    expect(screen.getByAltText(/QR code to approve this sign-in/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide QR code" }));
    expect(screen.queryByAltText(/QR code to approve this sign-in/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show QR code instead" }));
    expect(screen.getByAltText(/QR code to approve this sign-in/i)).toBeInTheDocument();
  });

  it("stops polling and offers another try when the phone denies", async () => {
    loginMock.mockResolvedValue(challenge(["phone", "totp"]));
    completeMock.mockResolvedValue({ status: "denied" });
    renderPage();
    await passwordStep();
    await startPhoneApproval();
    await tick(2000);
    expect(await screen.findByRole("alert")).toHaveTextContent(/denied on your phone/i);
    const calls = completeMock.mock.calls.length;
    await tick(10000);
    expect(completeMock.mock.calls.length).toBe(calls);
    expect(screen.getByRole("button", { name: "Approve on my phone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use a code instead" })).toBeInTheDocument();
  });

  it("falls back to the code field when the request expires", async () => {
    loginMock.mockResolvedValue(challenge(["phone", "totp"]));
    completeMock.mockResolvedValue({ status: "expired" });
    renderPage();
    await passwordStep();
    await startPhoneApproval();
    await tick(2000);
    expect(await screen.findByRole("alert")).toHaveTextContent(/expired/i);
    fireEvent.click(screen.getByRole("button", { name: "Use a code instead" }));
    expect(await screen.findByLabelText("6-digit code")).toBeInTheDocument();
  });

  it("ends the wait after the request window even if the server still says pending", async () => {
    loginMock.mockResolvedValue(challenge(["phone", "totp"]));
    completeMock.mockResolvedValue({ status: "pending" });
    renderPage();
    await passwordStep();
    await startPhoneApproval({ expires_in: 4 });
    await tick(12000);
    expect(await screen.findByRole("alert")).toHaveTextContent(/expired/i);
  });

  it("stops polling when the person leaves the phone step", async () => {
    loginMock.mockResolvedValue(challenge(["phone", "totp"]));
    completeMock.mockResolvedValue({ status: "pending" });
    renderPage();
    await passwordStep();
    await startPhoneApproval();
    await tick(2000);
    fireEvent.click(screen.getByRole("button", { name: "Use a code instead" }));
    const calls = completeMock.mock.calls.length;
    await tick(10000);
    expect(completeMock.mock.calls.length).toBe(calls);
  });

  it("starts over from the password when the sign-in step timed out", async () => {
    loginMock.mockResolvedValue(challenge(["phone", "totp"]));
    completeMock.mockRejectedValue({
      response: {
        data: { code: "challenge_invalid", detail: "This sign-in step expired. Start again." },
      },
    });
    renderPage();
    await passwordStep();
    await startPhoneApproval();
    await tick(2000);
    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/expired/i);
  });
});
