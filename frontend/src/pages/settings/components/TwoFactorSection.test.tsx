import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TwoFactorSection } from "./TwoFactorSection";
import { mfaService } from "@/services/mfaService";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/services/mfaService", async () => {
  const actual = await vi.importActual<typeof import("@/services/mfaService")>("@/services/mfaService");
  return {
    ...actual,
    mfaService: {
      status: vi.fn(),
      setup: vi.fn(),
      activate: vi.fn(),
      disable: vi.fn(),
      regenerateBackupCodes: vi.fn(),
    },
  };
});

const off = { enabled: false, required: false, required_by: null, backup_codes_remaining: 0 };
const on = { enabled: true, required: false, required_by: null, backup_codes_remaining: 10 };

const renderCard = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TwoFactorSection />
    </QueryClientProvider>
  );

describe("TwoFactorSection", () => {
  beforeEach(() => vi.resetAllMocks());

  it("enrols: password, then first code, then backup codes that must be acknowledged", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(off);
    vi.mocked(mfaService.setup).mockResolvedValue({
      secret: "ABCDEFGHIJKLMNOP",
      otpauth_uri: "otpauth://x",
      qr_svg: "<svg></svg>",
    });
    vi.mocked(mfaService.activate).mockResolvedValue({ backup_codes: ["AAAA-BBBB-CCCC"] });
    renderCard();

    fireEvent.click(await screen.findByRole("button", { name: /turn on/i }));
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(mfaService.setup).toHaveBeenCalledWith("pw"));

    fireEvent.change(await screen.findByLabelText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(mfaService.activate).toHaveBeenCalledWith("123456"));

    expect(await screen.findByTestId("backup-codes")).toHaveTextContent("AAAA-BBBB-CCCC");
    const done = screen.getByRole("button", { name: "Done" });
    expect(done).toBeDisabled();
    // No close button while the codes are unsaved.
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/I have saved these backup codes/i));
    expect(done).toBeEnabled();
  });

  it("shows the server's message for a wrong password and stays on the step", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(off);
    vi.mocked(mfaService.setup).mockRejectedValue({
      response: { data: { detail: "The password is not correct." } },
    });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: /turn on/i }));
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The password is not correct.");
  });

  it("offers turn-off when optional and sends password and code", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(on);
    vi.mocked(mfaService.disable).mockResolvedValue();
    renderCard();

    fireEvent.click(await screen.findByRole("button", { name: "Turn off" }));
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.change(screen.getByLabelText("Code from your authenticator app"), {
      target: { value: "654321" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Turn off" }).at(-1)!);
    await waitFor(() => expect(mfaService.disable).toHaveBeenCalledWith("pw", "654321"));
  });

  it("cannot be turned off while it is required, and says why", async () => {
    vi.mocked(mfaService.status).mockResolvedValue({ ...on, required: true, required_by: "global" });
    renderCard();
    expect(await screen.findByText(/requires two-factor authentication for everyone/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn off" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new backup codes/i })).toBeInTheDocument();
  });

  it("warns when backup codes run low", async () => {
    vi.mocked(mfaService.status).mockResolvedValue({ ...on, backup_codes_remaining: 1 });
    renderCard();
    expect(await screen.findByText("1 left")).toBeInTheDocument();
  });
});
