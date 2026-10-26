import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PasswordRow } from "./PasswordRow";
import { authService } from "@/services/authService";
import { mfaService } from "@/services/mfaService";
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
vi.mock("@/services/authService", () => ({ authService: { changePassword: vi.fn() } }));
vi.mock("@/services/mfaService", async () => {
  const actual = await vi.importActual<typeof import("@/services/mfaService")>("@/services/mfaService");
  return { ...actual, mfaService: { status: vi.fn() } };
});

const off = { enabled: false, required: false, required_by: null, backup_codes_remaining: 0 };
const on = { ...off, enabled: true, backup_codes_remaining: 10 };

const renderRow = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PasswordRow />
    </QueryClientProvider>
  );

const fill = (current: string, next: string, confirm: string) => {
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirm } });
};

describe("PasswordRow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mfaService.status).mockResolvedValue(off);
  });

  it("opens a dialog with three labelled password fields", () => {
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText("Current password")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("New password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute("type", "password");
  });

  it("does not call the API when the confirmation differs", () => {
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    fill("old", "Another-Sturdy-4417", "different");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getByRole("alert")).toHaveTextContent("New passwords do not match");
    expect(authService.changePassword).not.toHaveBeenCalled();
  });

  it("sends the change, confirms with a toast and closes", async () => {
    vi.mocked(authService.changePassword).mockResolvedValue(undefined);
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    fill("old-pass", "Another-Sturdy-4417", "Another-Sturdy-4417");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() =>
      expect(authService.changePassword).toHaveBeenCalledWith("old-pass", "Another-Sturdy-4417", undefined)
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText("New password")).not.toBeInTheDocument());
  });

  it("shows the server's policy messages and keeps the dialog open", async () => {
    vi.mocked(authService.changePassword).mockRejectedValue({
      response: { data: { detail: "Password does not meet the password policy.", messages: ["This password is too short."] } },
    });
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    fill("old-pass", "short", "short");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This password is too short.");
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("asks for an authenticator code only when two-factor is on", async () => {
    vi.mocked(mfaService.status).mockResolvedValue(on);
    vi.mocked(authService.changePassword).mockResolvedValue(undefined);
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    fill("old-pass", "Another-Sturdy-4417", "Another-Sturdy-4417");
    fireEvent.change(await screen.findByLabelText("Code from your authenticator app"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() =>
      expect(authService.changePassword).toHaveBeenCalledWith("old-pass", "Another-Sturdy-4417", "123456")
    );
  });
});
