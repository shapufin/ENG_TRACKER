import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MfaPromptModal } from "./MfaPromptModal";
import { mfaService } from "@/services/mfaService";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
  useNavigate: () => navigateMock,
}));

const auth = vi.hoisted(() => ({ user: { id: 42 } as { id: number } | null }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: auth.user }) }));

vi.mock("@/services/mfaService", () => ({ mfaService: { status: vi.fn() } }));

const off = { enabled: false, required: false, required_by: null, backup_codes_remaining: 0 };
const on = { enabled: true, required: false, required_by: null, backup_codes_remaining: 10 };
const TITLE = /two-factor authentication is required/i;

const renderModal = (path = "/dashboard") =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <MfaPromptModal />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe("MfaPromptModal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    auth.user = { id: 42 };
  });

  it("explains that two-factor is mandatory when the user is not enrolled", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(off);
    renderModal();

    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set up two-factor now/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remind me later/i })).toBeInTheDocument();
  });

  it("stays closed for an enrolled user", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(on);
    renderModal();

    await waitFor(() => expect(mfaService.status).toHaveBeenCalled());
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it("stays closed, and asks nothing, when nobody is signed in", async () => {
    auth.user = null;
    renderModal();

    expect(mfaService.status).not.toHaveBeenCalled();
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it("stays closed when the status cannot be loaded", async () => {
    vi.mocked(mfaService.status).mockRejectedValue(new Error("boom"));
    renderModal();

    await waitFor(() => expect(mfaService.status).toHaveBeenCalled());
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it("stays closed on the settings page, where the user is already setting it up", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(off);
    renderModal("/settings");

    await waitFor(() => expect(mfaService.status).toHaveBeenCalled());
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it("snoozes for the browser session on 'Remind me later'", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(off);
    renderModal();

    fireEvent.click(await screen.findByRole("button", { name: /remind me later/i }));

    expect(sessionStorage.getItem("mfa_prompt_dismissed:42")).toBe("true");
    await waitFor(() => expect(screen.queryByText(TITLE)).not.toBeInTheDocument());
  });

  it("does not reappear within a session that already snoozed it", async () => {
    sessionStorage.setItem("mfa_prompt_dismissed:42", "true");
    vi.mocked(mfaService.status).mockResolvedValue(off);
    renderModal();

    await waitFor(() => expect(mfaService.status).toHaveBeenCalled());
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it("does not inherit another account's snooze", async () => {
    sessionStorage.setItem("mfa_prompt_dismissed:7", "true");
    vi.mocked(mfaService.status).mockResolvedValue(off);
    renderModal();

    expect(await screen.findByText(TITLE)).toBeInTheDocument();
  });

  it("opens the enrolment dialog on /settings through router state", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(off);
    renderModal();

    fireEvent.click(await screen.findByRole("button", { name: /set up two-factor now/i }));

    expect(navigateMock).toHaveBeenCalledWith("/settings", { state: { openMfaSetup: true } });
    expect(sessionStorage.getItem("mfa_prompt_dismissed:42")).toBe("true");
  });
});
