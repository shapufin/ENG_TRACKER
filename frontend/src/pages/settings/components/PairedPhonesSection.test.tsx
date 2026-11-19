import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { PairedPhonesSection } from "./PairedPhonesSection";
import { mfaService } from "@/services/mfaService";
import {
  PasskeyCancelledError,
  isPasskeySupported,
  registerPasskey,
} from "@/services/passkeyService";
import {
  currentPushEndpoint,
  pairPhone,
  removePhone,
  renamePhone,
} from "@/services/phoneApprovalService";
import { toast } from "sonner";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));
vi.mock("@/services/mfaService", async () => ({
  ...(await vi.importActual<typeof import("@/services/mfaService")>("@/services/mfaService")),
  mfaService: { status: vi.fn() },
}));
vi.mock("@/services/passkeyService", async () => ({
  ...(await vi.importActual<typeof import("@/services/passkeyService")>(
    "@/services/passkeyService"
  )),
  isPasskeySupported: vi.fn(),
  registerPasskey: vi.fn(),
}));
vi.mock("@/services/phoneApprovalService", () => ({
  pairPhone: vi.fn(),
  renamePhone: vi.fn(),
  removePhone: vi.fn(),
  currentPushEndpoint: vi.fn(),
}));

const push = vi.hoisted(() => ({
  state: {
    pushAvailability: "available",
    permission: "default",
    requestPermission: vi.fn(),
    subscribe: vi.fn(),
  },
}));
vi.mock("@/hooks/usePushNotifications", () => ({ usePushNotifications: () => push.state }));

const phone = {
  id: 7,
  name: "My phone",
  can_push: true,
  created_at: "2026-11-01T10:00:00Z",
  last_used_at: null,
};
const qrOnly = {
  id: 8,
  name: "Old phone",
  can_push: false,
  created_at: "2026-11-02T10:00:00Z",
  last_used_at: "2026-11-10T08:00:00Z",
};
const base = {
  enabled: false,
  enrolled: true,
  required: false,
  required_by: null,
  backup_codes_remaining: 0,
  passkeys: [],
};
const status = (over: object = {}) => ({
  ...base,
  phone_approval: true,
  phones: [phone, qrOnly],
  ...over,
});

const renderSection = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <PairedPhonesSection />
      </MemoryRouter>
    </QueryClientProvider>
  );

const fillAndSubmit = async (submit: string, password = "pw") => {
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(dialog.querySelector("input[type=password]")!, { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: submit }));
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isPasskeySupported).mockReturnValue(true);
  push.state.pushAvailability = "available";
  push.state.requestPermission.mockResolvedValue(true);
  push.state.subscribe.mockResolvedValue(true);
});

describe("PairedPhonesSection", () => {
  it("renders nothing while phone approval is switched off", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(
      status({ phone_approval: undefined, phones: undefined })
    );
    const { container } = renderSection();
    await waitFor(() => expect(mfaService.status).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each phone with its notification state and last use", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status());
    renderSection();
    expect(await screen.findByText("My phone")).toBeInTheDocument();
    expect(screen.getByText(/Notifications on/)).toBeInTheDocument();
    expect(screen.getByText(/QR code only/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove phone My phone" })).toBeInTheDocument();
  });

  it("creates a passkey on this phone, asks for notifications and pairs it", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status({ phones: [] }));
    vi.mocked(registerPasskey).mockResolvedValue({
      id: 33,
      name: "This phone",
      created_at: "x",
      last_used_at: null,
    });
    vi.mocked(currentPushEndpoint).mockResolvedValue("https://fcm.googleapis.com/fcm/send/abc");
    vi.mocked(pairPhone).mockResolvedValue(phone);
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Set up this phone" }));
    await fillAndSubmit("Set up phone");

    await waitFor(() =>
      expect(pairPhone).toHaveBeenCalledWith({
        password: "pw",
        code: "",
        credentialId: 33,
        name: "This phone",
        pushEndpoint: "https://fcm.googleapis.com/fcm/send/abc",
      })
    );
    expect(registerPasskey).toHaveBeenCalledWith("pw", "This phone");
    expect(push.state.requestPermission).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it("still pairs, as QR only, when notifications are refused", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status({ phones: [] }));
    vi.mocked(registerPasskey).mockResolvedValue({
      id: 33,
      name: "This phone",
      created_at: "x",
      last_used_at: null,
    });
    vi.mocked(pairPhone).mockResolvedValue(qrOnly);
    push.state.requestPermission.mockResolvedValue(false);
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Set up this phone" }));
    await fillAndSubmit("Set up phone");

    await waitFor(() =>
      expect(pairPhone).toHaveBeenCalledWith(expect.objectContaining({ pushEndpoint: "" }))
    );
    expect(push.state.subscribe).not.toHaveBeenCalled();
    expect(toast.message).toHaveBeenCalledWith(expect.stringMatching(/QR code/));
  });

  it("explains a device that already has a passkey instead of failing silently", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status({ phones: [] }));
    vi.mocked(registerPasskey).mockRejectedValue(new DOMException("exists", "InvalidStateError"));
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Set up this phone" }));
    await fillAndSubmit("Set up phone");
    expect(await screen.findByRole("alert")).toHaveTextContent(/already has a passkey/i);
    expect(pairPhone).not.toHaveBeenCalled();
  });

  it("keeps the dialog open with a calm message when the prompt is closed", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status({ phones: [] }));
    vi.mocked(registerPasskey).mockRejectedValue(new PasskeyCancelledError());
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Set up this phone" }));
    await fillAndSubmit("Set up phone");
    expect(await screen.findByRole("alert")).toHaveTextContent(/closed before it finished/i);
    expect(pairPhone).not.toHaveBeenCalled();
  });

  it("renames and removes behind the password", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(status());
    vi.mocked(renamePhone).mockResolvedValue({ ...phone, name: "Work" });
    vi.mocked(removePhone).mockResolvedValue(undefined);
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Rename phone My phone" }));
    const nameField = await screen.findByLabelText("Name");
    fireEvent.change(nameField, { target: { value: "Work" } });
    await fillAndSubmit("Save name");
    await waitFor(() => expect(renamePhone).toHaveBeenCalledWith(7, "Work", "pw", ""));

    fireEvent.click(await screen.findByRole("button", { name: "Remove phone Old phone" }));
    await fillAndSubmit("Remove phone");
    await waitFor(() => expect(removePhone).toHaveBeenCalledWith(8, "pw", ""));
  });
});
