import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LoginPage } from "./LoginPage";
import { PasskeyCancelledError } from "@/services/passkeyService";

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

const loginMock = vi.fn();
const verifyMfaMock = vi.fn();
const verifyPasskeyMock = vi.fn();
const startLoginSetupMock = vi.fn();
const finishLoginSetupMock = vi.fn();
const finishLoginPasskeySetupMock = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    login: loginMock,
    verifyMfa: verifyMfaMock,
    verifyPasskey: verifyPasskeyMock,
    startLoginSetup: startLoginSetupMock,
    finishLoginSetup: finishLoginSetupMock,
    finishLoginPasskeySetup: finishLoginPasskeySetupMock,
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

const session = { access: "tok", user: { id: 1, username: "ann", is_staff: false, is_superuser: false } };
const apiError = (code: string, detail: string) => ({ response: { data: { code, detail } } });

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

const challenge = (methods: Array<"passkey" | "totp">) => ({
  mfa_required: true,
  mfa_token: "chal",
  methods,
});

describe("LoginPage passkey second factor", () => {
  beforeEach(() => {
    for (const mock of [
      loginMock,
      verifyMfaMock,
      verifyPasskeyMock,
      startLoginSetupMock,
      finishLoginSetupMock,
      finishLoginPasskeySetupMock,
    ]) {
      mock.mockReset();
    }
    supported.value = true;
    navigateMock = vi.fn();
  });

  it("offers Face ID / fingerprint first and signs in without a typed code", async () => {
    loginMock.mockResolvedValue(challenge(["passkey", "totp"]));
    verifyPasskeyMock.mockResolvedValue(session);
    renderPage();
    await enterPassword();

    const button = await screen.findByRole("button", { name: /use face id or fingerprint/i });
    expect(screen.queryByLabelText("6-digit code")).not.toBeInTheDocument();
    fireEvent.click(button);

    await waitFor(() => expect(verifyPasskeyMock).toHaveBeenCalledWith("chal"));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/dashboard"));
    expect(verifyMfaMock).not.toHaveBeenCalled();
  });

  it("falls back to the code field without an error when the prompt is dismissed", async () => {
    loginMock.mockResolvedValue(challenge(["passkey", "totp"]));
    verifyPasskeyMock.mockRejectedValue(new PasskeyCancelledError());
    renderPage();
    await enterPassword();
    fireEvent.click(await screen.findByRole("button", { name: /use face id or fingerprint/i }));

    await waitFor(() => expect(verifyPasskeyMock).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use a code instead" }));
    expect(await screen.findByLabelText("6-digit code")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("switches to a code, signs in with it, and can go back to the passkey", async () => {
    loginMock.mockResolvedValue(challenge(["passkey", "totp"]));
    verifyMfaMock.mockResolvedValue(session);
    renderPage();
    await enterPassword();
    fireEvent.click(await screen.findByRole("button", { name: "Use a code instead" }));

    fireEvent.change(await screen.findByLabelText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(verifyMfaMock).toHaveBeenCalledWith("chal", "123456"));

    expect(screen.getByRole("button", { name: "Use my passkey instead" })).toBeInTheDocument();
  });

  it("shows the server's message when the passkey is refused and stays on the step", async () => {
    loginMock.mockResolvedValue(challenge(["passkey", "totp"]));
    verifyPasskeyMock.mockRejectedValue(
      apiError("passkey_invalid", "That passkey could not be verified. Try again, or use a code instead.")
    );
    renderPage();
    await enterPassword();
    fireEvent.click(await screen.findByRole("button", { name: /use face id or fingerprint/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be verified");
    expect(screen.getByRole("button", { name: /use face id or fingerprint/i })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("returns to the password step when the challenge expired", async () => {
    loginMock.mockResolvedValue(challenge(["passkey", "totp"]));
    verifyPasskeyMock.mockRejectedValue(apiError("challenge_invalid", "This sign-in step expired. Start again."));
    renderPage();
    await enterPassword();
    fireEvent.click(await screen.findByRole("button", { name: /use face id or fingerprint/i }));

    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("expired");
  });

  it("goes straight to the code field when the browser cannot do passkeys", async () => {
    supported.value = false;
    loginMock.mockResolvedValue(challenge(["passkey", "totp"]));
    renderPage();
    await enterPassword();

    expect(await screen.findByLabelText("6-digit code")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /use face id or fingerprint/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use my passkey instead" })).not.toBeInTheDocument();
  });

  it("does not offer a code to a passkey-only account", async () => {
    loginMock.mockResolvedValue(challenge(["passkey"]));
    renderPage();
    await enterPassword();

    await screen.findByRole("button", { name: /use face id or fingerprint/i });
    expect(screen.queryByRole("button", { name: "Use a code instead" })).not.toBeInTheDocument();
  });

  it("explains a passkey-only account on a browser without passkeys instead of a dead code field", async () => {
    supported.value = false;
    loginMock.mockResolvedValue(challenge(["passkey"]));
    renderPage();
    await enterPassword();

    expect(await screen.findByRole("alert")).toHaveTextContent(/passkey/i);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("6-digit code")).not.toBeInTheDocument();
  });

  it("treats a challenge without a methods list exactly as before", async () => {
    loginMock.mockResolvedValue({ mfa_required: true, mfa_token: "chal" });
    renderPage();
    await enterPassword();
    expect(await screen.findByLabelText("6-digit code")).toBeInTheDocument();
  });

  describe("required but not set up yet", () => {
    const setup = { secret: "ABCDEFGHIJKLMNOP", otpauth_uri: "otpauth://x", qr_svg: "<svg></svg>" };
    const required = { mfa_setup_required: true, mfa_token: "chal", methods: ["passkey", "totp"] };

    it("lets the user choose a passkey and signs in without backup codes", async () => {
      loginMock.mockResolvedValue(required);
      finishLoginPasskeySetupMock.mockResolvedValue(session);
      renderPage();
      await enterPassword();

      fireEvent.click(await screen.findByRole("button", { name: /set up face id or fingerprint/i }));
      await waitFor(() => expect(finishLoginPasskeySetupMock).toHaveBeenCalledWith("chal", "This device"));
      await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/dashboard"));
      expect(startLoginSetupMock).not.toHaveBeenCalled();
    });

    it("lets the user choose an authenticator app instead", async () => {
      loginMock.mockResolvedValue(required);
      startLoginSetupMock.mockResolvedValue(setup);
      renderPage();
      await enterPassword();

      fireEvent.click(await screen.findByRole("button", { name: /use an authenticator app/i }));
      expect(await screen.findByAltText(/QR code/i)).toBeInTheDocument();
      expect(startLoginSetupMock).toHaveBeenCalledWith("chal");
    });

    it("stays on the choice with no error when the prompt is dismissed", async () => {
      loginMock.mockResolvedValue(required);
      finishLoginPasskeySetupMock.mockRejectedValue(new PasskeyCancelledError());
      renderPage();
      await enterPassword();
      fireEvent.click(await screen.findByRole("button", { name: /set up face id or fingerprint/i }));

      await waitFor(() => expect(finishLoginPasskeySetupMock).toHaveBeenCalled());
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /use an authenticator app/i })).toBeInTheDocument();
    });

    it("goes straight to the authenticator app when passkeys are not supported", async () => {
      supported.value = false;
      loginMock.mockResolvedValue(required);
      startLoginSetupMock.mockResolvedValue(setup);
      renderPage();
      await enterPassword();

      expect(await screen.findByAltText(/QR code/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /set up face id or fingerprint/i })).not.toBeInTheDocument();
    });
  });
});
