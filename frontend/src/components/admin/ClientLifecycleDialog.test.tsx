import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClientLifecycleDialog } from "./ClientLifecycleDialog";
import { overtimeService, type ClientLifecycle } from "@/services/overtimeService";

vi.mock("@/services/overtimeService", () => ({
  overtimeService: { getClientLifecycle: vi.fn() },
}));
vi.mock("./PluginClientOnboarding", () => ({
  PluginClientOnboarding: () => <div>onboarding slot</div>,
}));

const client = { id: 7, name: "Old", code: "OLD", description: "", is_active: false, created_at: "" };

const lifecycle = (overrides: Partial<ClientLifecycle> = {}): ClientLifecycle => ({
  is_active: false,
  assigned_users: 0,
  counts: {},
  cascade_counts: {},
  last_activity: null,
  can_delete: true,
  blockers: [],
  ...overrides,
});

const renderDialog = (onDelete = vi.fn()) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ClientLifecycleDialog
        client={client}
        open
        onOpenChange={vi.fn()}
        onDelete={onDelete}
        isDeleting={false}
      />
    </QueryClientProvider>
  );
  return onDelete;
};

describe("ClientLifecycleDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the records kept, onboarding data and last activity", async () => {
    vi.mocked(overtimeService.getClientLifecycle).mockResolvedValue(
      lifecycle({
        counts: { overtime_logs: 14, standby_logs: 2 },
        cascade_counts: { onboarding_folders: 3, onboarding_documents: 8 },
        last_activity: "2026-05-04",
        can_delete: false,
        blockers: ["Client still has records that must be kept: overtime_logs (14)."],
      })
    );
    renderDialog();
    expect(await screen.findByText("Overtime logs")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("Standby logs")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("2026-05-04")).toBeInTheDocument();
    expect(screen.getByText("onboarding slot")).toBeInTheDocument();
  });

  it("lists why the client cannot be deleted and offers no delete button", async () => {
    vi.mocked(overtimeService.getClientLifecycle).mockResolvedValue(
      lifecycle({ can_delete: false, blockers: ["Client still has onboarding data to purge first."] })
    );
    renderDialog();
    expect(await screen.findByText(/onboarding data to purge first/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete client" })).not.toBeInTheDocument();
  });

  it("needs the typed client code before deleting", async () => {
    vi.mocked(overtimeService.getClientLifecycle).mockResolvedValue(lifecycle());
    const onDelete = renderDialog();
    const button = await screen.findByRole("button", { name: "Delete client" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type OLD to confirm/), { target: { value: "old" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type OLD to confirm/), { target: { value: "OLD" } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(7));
  });
});
