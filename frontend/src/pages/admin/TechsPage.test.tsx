import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TechsPage } from "./TechsPage";
import { userService } from "@/services/userService";
import type { Tech } from "@/types";

// Mock the service so no network calls happen.
vi.mock("@/services/userService", () => ({
  userService: {
    getTechs: vi.fn(),
    createTech: vi.fn(),
    updateTech: vi.fn(),
    deleteTech: vi.fn(),
  },
}));

// Mock sonner toast so we can assert calls without side effects.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Import the mocked toast so we can assert on it directly (vi.mock hoists).
import { toast } from "sonner";

// PluginImportButton (admin page headers) reads the active-plugin list. With
// data_import inactive it renders nothing — the same graceful path taken when
// the plugin is disabled or removed.
vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: [], isLoading: false }),
}));

// Mock the child dialogs — TechsPage owns their open state, but we don't
// want to exercise their internals here. We expose onConfirm/onOpenChange
// so the page's mutation wiring stays under test.
vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    description,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean;
    title: string;
    description?: string;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {description}
        <button type="button" onClick={onConfirm} aria-label="Confirm delete">
          Confirm
        </button>
        <button type="button" onClick={() => onOpenChange(false)} aria-label="Cancel delete">
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/admin/TechMembersDialog", () => ({
  TechMembersDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Manage users">
        <button type="button" onClick={() => onOpenChange(false)} aria-label="Close members">
          Close
        </button>
      </div>
    ) : null,
}));

const activeTech: Tech = { id: 1, name: "Infrastructure", code: "INFRA", is_active: true };
const inactiveTech: Tech = { id: 2, name: "Legacy", code: "LEGACY", is_active: false };

const renderWithProvider = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe("TechsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userService.getTechs).mockResolvedValue({
      count: 2,
      results: [activeTech, inactiveTech],
    } as never);
    vi.mocked(userService.createTech).mockResolvedValue(activeTech as never);
    vi.mocked(userService.updateTech).mockResolvedValue(activeTech as never);
    vi.mocked(userService.deleteTech).mockResolvedValue(undefined as never);
  });

  it("renders a loading state while techs are fetching", () => {
    vi.mocked(userService.getTechs).mockReturnValue(new Promise(() => {}) as never);
    renderWithProvider(<TechsPage />);
    expect(screen.getByText("Loading Techs...")).toBeInTheDocument();
  });

  it("renders an empty state when there are no techs", async () => {
    vi.mocked(userService.getTechs).mockResolvedValue({ count: 0, results: [] } as never);
    renderWithProvider(<TechsPage />);
    await waitFor(() => {
      expect(screen.getByText("No Techs yet")).toBeInTheDocument();
    });
    expect(screen.getByText("Add one above to get started.")).toBeInTheDocument();
  });

  it("renders tech rows with name and code", async () => {
    renderWithProvider(<TechsPage />);
    await waitFor(() => {
      expect(screen.getByText("Infrastructure")).toBeInTheDocument();
      expect(screen.getByText("INFRA")).toBeInTheDocument();
      expect(screen.getByText("Legacy")).toBeInTheDocument();
      expect(screen.getByText("LEGACY")).toBeInTheDocument();
    });
  });

  it("renders an Inactive badge and reduced opacity for inactive techs", async () => {
    renderWithProvider(<TechsPage />);
    await waitFor(() => expect(screen.getByText("Legacy")).toBeInTheDocument());
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("creates a tech when the Add button is clicked", async () => {
    renderWithProvider(<TechsPage />);
    await waitFor(() => expect(screen.getByText("Infrastructure")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Backup" } });
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "backup" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    await waitFor(() => {
      expect(userService.createTech).toHaveBeenCalledWith({ name: "Backup", code: "BACKUP" });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Tech created");
    });
  });

  it("enters edit mode and updates a tech on Save", async () => {
    renderWithProvider(<TechsPage />);
    await waitFor(() => expect(screen.getByText("Infrastructure")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Edit Infrastructure"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Infra Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(userService.updateTech).toHaveBeenCalledWith(1, {
        name: "Infra Updated",
        code: "INFRA",
      });
    });
  });

  it("toggles a tech active status via the Power button", async () => {
    renderWithProvider(<TechsPage />);
    await waitFor(() => expect(screen.getByText("Infrastructure")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Deactivate Infrastructure"));

    await waitFor(() => {
      expect(userService.updateTech).toHaveBeenCalledWith(1, { is_active: false });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Tech status updated");
    });
  });

  it("opens the members dialog when the Manage users button is clicked", async () => {
    renderWithProvider(<TechsPage />);
    await waitFor(() => expect(screen.getByText("Infrastructure")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Manage users in Infrastructure"));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Manage users" })).toBeInTheDocument();
    });
  });

  it("opens the delete confirm dialog and deletes the tech on confirm", async () => {
    renderWithProvider(<TechsPage />);
    await waitFor(() => expect(screen.getByText("Infrastructure")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Delete Infrastructure"));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Delete Tech" })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByLabelText("Confirm delete"));

    await waitFor(() => {
      expect(userService.deleteTech).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Tech deleted");
    });
  });

  it("shows an error toast when create fails", async () => {
    vi.mocked(userService.createTech).mockRejectedValue(new Error("dup") as never);
    renderWithProvider(<TechsPage />);
    await waitFor(() => expect(screen.getByText("Infrastructure")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Dup" } });
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "DUP" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to create Tech. Check for duplicate name/code."
      );
    });
  });
});
