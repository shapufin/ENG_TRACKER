import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LoginPage } from "./LoginPage";

// Radix Checkbox measures itself; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const loginMock = vi.fn();
const verifyMfaMock = vi.fn();
const startLoginSetupMock = vi.fn();
const finishLoginSetupMock = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    login: loginMock,
    verifyMfa: verifyMfaMock,
    startLoginSetup: startLoginSetupMock,
    finishLoginSetup: finishLoginSetupMock,
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

const employee = { id: 1, username: "ann", is_staff: false, is_superuser: false };
const session = { access: "tok", user: employee };

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

const enterPassword = async () => {
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "ann" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw" } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
};

const apiError = (code: string, detail: string) => ({ response: { data: { code, detail } } });

describe("LoginPage second factor", () => {
  beforeEach(() => {
    loginMock.mockReset();
    verifyMfaMock.mockReset();
    startLoginSetupMock.mockReset();
    finishLoginSetupMock.mockReset();
    navigateMock = vi.fn();
  });

  it("asks for the code after a correct password and signs in with it", async () => {
    loginMock.mockResolvedValue({ mfa_required: true, mfa_token: "chal" });
    verifyMfaMock.mockResolvedValue(session);
    renderPage();
    await enterPassword();

    const field = await screen.findByLabelText("6-digit code");
    expect(screen.getByRole("heading", { name: "Two-factor authentication" })).toBeInTheDocument();
    expect(field).toHaveAttribute("autocomplete", "one-time-code");
    expect(navigateMock).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: "123 456" } });
    expect(field).toHaveValue("123456");
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(verifyMfaMock).toHaveBeenCalledWith("chal", "123456"));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("does not keep the password around once the challenge is issued", async () => {
    loginMock.mockResolvedValue({ mfa_required: true, mfa_token: "chal" });
    renderPage();
    await enterPassword();
    await screen.findByLabelText("6-digit code");
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
  });

  it("switches to a backup code and back", async () => {
    loginMock.mockResolvedValue({ mfa_required: true, mfa_token: "chal" });
    renderPage();
    await enterPassword();
    await screen.findByLabelText("6-digit code");

    fireEvent.click(screen.getByRole("button", { name: "Use a backup code instead" }));
    const backup = screen.getByLabelText("Backup code");
    fireEvent.change(backup, { target: { value: "abcd-efgh-jkmn" } });
    expect(backup).toHaveValue("ABCD-EFGH-JKMN");

    fireEvent.click(screen.getByRole("button", { name: "Use my authenticator app instead" }));
    expect(screen.getByLabelText("6-digit code")).toHaveValue("");
  });

  it("shows the server's message for a wrong code and stays on the step", async () => {
    loginMock.mockResolvedValue({ mfa_required: true, mfa_token: "chal" });
    verifyMfaMock.mockRejectedValue(apiError("invalid_code", "That code is not right."));
    renderPage();
    await enterPassword();
    fireEvent.change(await screen.findByLabelText("6-digit code"), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not right.");
    expect(screen.getByLabelText("6-digit code")).toHaveValue("");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("returns to the password step when the challenge has expired", async () => {
    loginMock.mockResolvedValue({ mfa_required: true, mfa_token: "chal" });
    verifyMfaMock.mockRejectedValue(apiError("challenge_invalid", "This sign-in step expired. Start again."));
    renderPage();
    await enterPassword();
    fireEvent.change(await screen.findByLabelText("6-digit code"), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("expired");
  });

  it("can go back to the password step", async () => {
    loginMock.mockResolvedValue({ mfa_required: true, mfa_token: "chal" });
    renderPage();
    await enterPassword();
    await screen.findByLabelText("6-digit code");
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
  });

  describe("required but not set up yet", () => {
    const setup = { secret: "ABCDEFGHIJKLMNOP", otpauth_uri: "otpauth://x", qr_svg: "<svg></svg>" };

    it("walks through setup, shows backup codes, and only continues once they are saved", async () => {
      loginMock.mockResolvedValue({ mfa_setup_required: true, mfa_token: "chal" });
      startLoginSetupMock.mockResolvedValue(setup);
      finishLoginSetupMock.mockResolvedValue({ ...session, backup_codes: ["AAAA-BBBB-CCCC", "DDDD-EEEE-FFFF"] });
      renderPage();
      await enterPassword();

      expect(await screen.findByRole("heading", { name: "Set up two-factor authentication" })).toBeInTheDocument();
      expect(startLoginSetupMock).toHaveBeenCalledWith("chal");
      expect(screen.getByAltText(/QR code/i)).toBeInTheDocument();
      expect(screen.getByTestId("mfa-secret")).toHaveTextContent("ABCD EFGH IJKL MNOP");

      fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "654321" } });
      fireEvent.click(screen.getByRole("button", { name: /turn on and sign in/i }));

      await waitFor(() => expect(finishLoginSetupMock).toHaveBeenCalledWith("chal", "654321"));
      expect(await screen.findByTestId("backup-codes")).toHaveTextContent("AAAA-BBBB-CCCC");

      const next = screen.getByRole("button", { name: "Continue" });
      expect(next).toBeDisabled();
      expect(navigateMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByLabelText(/I have saved these backup codes/i));
      expect(next).toBeEnabled();
      fireEvent.click(next);
      await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/dashboard"));
    });
  });

  it("still signs in with no extra step when the account has no second factor", async () => {
    loginMock.mockResolvedValue(session);
    renderPage();
    await enterPassword();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/dashboard"));
    expect(verifyMfaMock).not.toHaveBeenCalled();
  });
});
