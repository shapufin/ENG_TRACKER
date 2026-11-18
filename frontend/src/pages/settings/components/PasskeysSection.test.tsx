import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { PasskeysSection } from "./PasskeysSection";
import { mfaService } from "@/services/mfaService";
import {
  PasskeyCancelledError,
  isPasskeySupported,
  registerPasskey,
  removePasskey,
  renamePasskey,
} from "@/services/passkeyService";
import { toast } from "sonner";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/services/mfaService", async () => ({
  ...(await vi.importActual<typeof import("@/services/mfaService")>("@/services/mfaService")),
  mfaService: { status: vi.fn() },
}));
vi.mock("@/services/passkeyService", async () => ({
  ...(await vi.importActual<typeof import("@/services/passkeyService")>("@/services/passkeyService")),
  isPasskeySupported: vi.fn(),
  registerPasskey: vi.fn(),
  renamePasskey: vi.fn(),
  removePasskey: vi.fn(),
}));

const phone = { id: 1, name: "Phone", created_at: "2026-11-01T10:00:00Z", last_used_at: "2026-11-10T08:00:00Z" };
const laptop = { id: 2, name: "Laptop", created_at: "2026-11-02T10:00:00Z", last_used_at: null };
const base = { enabled: false, required: false, required_by: null, backup_codes_remaining: 0 };
const status = (over: object = {}) => ({ ...base, enrolled: true, passkeys: [phone, laptop], ...over });

const renderSection = (entry: string | { pathname: string; state?: unknown } = "/settings") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <PasskeysSection />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe("PasskeysSection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isPasskeySupported).mockReturnValue(true);
  });

  it("renders nothing for a browser without passkeys when none are registered", async () => {
    vi.mocked(isPasskeySupported).mockReturnValue(false);
    vi.mocked(mfaService.status).mockResolvedValue(status({ passkeys: [], enrolled: false }));
    const { container } = renderSection();

    await waitFor(() => expect(mfaService.status).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each passkey with when it was added and last used", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status());
    renderSection();

    expect(await screen.findByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText(/never used/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove passkey Phone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename passkey Laptop" })).toBeInTheDocument();
  });

  it("keeps the list manageable on a browser that cannot add passkeys", async () => {
    vi.mocked(isPasskeySupported).mockReturnValue(false);
    vi.mocked(mfaService.status).mockResolvedValue(status());
    renderSection();

    expect(await screen.findByText("Phone")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add a passkey/i })).not.toBeInTheDocument();
  });

  it("adds a passkey after the password, with a name", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status({ passkeys: [], enrolled: false }));
    vi.mocked(registerPasskey).mockResolvedValue({ ...phone, name: "Work phone" });
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Work phone" } });
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add passkey" }));

    await waitFor(() => expect(registerPasskey).toHaveBeenCalledWith("pw", "Work phone"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Passkey added"));
  });

  it("explains a dismissed prompt inline instead of failing loudly", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status({ passkeys: [], enrolled: false }));
    vi.mocked(registerPasskey).mockRejectedValue(new PasskeyCancelledError());
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add passkey" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/closed before it finished/i);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the server's message when the password is wrong", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status({ passkeys: [], enrolled: false }));
    vi.mocked(registerPasskey).mockRejectedValue({
      response: { data: { code: "invalid_password", detail: "The password is not correct." } },
    });
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: /add a passkey/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "bad" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add passkey" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The password is not correct.");
  });

  it("renames a passkey after the password", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status());
    vi.mocked(renamePasskey).mockResolvedValue({ ...laptop, name: "Desk" });
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Rename passkey Laptop" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText("Name");
    expect(name).toHaveValue("Laptop");
    fireEvent.change(name, { target: { value: "Desk" } });
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save name" }));

    await waitFor(() => expect(renamePasskey).toHaveBeenCalledWith(2, "Desk", "pw", ""));
  });

  it("removes a passkey after the password, with no code field when no authenticator app is on", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status());
    vi.mocked(removePasskey).mockResolvedValue(undefined);
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Remove passkey Phone" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText(/code/i)).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove passkey" }));

    await waitFor(() => expect(removePasskey).toHaveBeenCalledWith(1, "pw", ""));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Passkey removed"));
  });

  it("asks for an authenticator code too when the app is on", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status({ enabled: true }));
    vi.mocked(removePasskey).mockResolvedValue(undefined);
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Remove passkey Phone" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.change(within(dialog).getByLabelText(/code from your authenticator app/i), {
      target: { value: "123456" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove passkey" }));

    await waitFor(() => expect(removePasskey).toHaveBeenCalledWith(1, "pw", "123456"));
  });

  it("shows the refusal when the last required factor cannot be removed", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status({ passkeys: [phone], required: true, required_by: "user" }));
    vi.mocked(removePasskey).mockRejectedValue({
      response: { data: { code: "last_factor", detail: "This is your only sign-in factor." } },
    });
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Remove passkey Phone" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove passkey" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("only sign-in factor");
  });

  it("opens the add dialog when sent here by the logon prompt", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status({ passkeys: [], enrolled: false }));
    renderSection({ pathname: "/settings", state: { openPasskeySetup: true } });

    expect(await screen.findByRole("heading", { name: /add a passkey/i })).toBeInTheDocument();
  });
});
