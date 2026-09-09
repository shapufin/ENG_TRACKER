import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClientsPage } from "./ClientsPage";
import * as useClientManagement from "./hooks/useClientManagement";

// PluginImportButton (admin page headers) reads the active-plugin list. With
// data_import inactive it renders nothing — the same graceful path taken when
// the plugin is disabled or removed.
vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: [], isLoading: false }),
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, "ResizeObserver", { value: ResizeObserverMock, writable: true });

const mockHook = {
  clients: null,
  isLoading: false,
  formOpen: false,
  setFormOpen: vi.fn(),
  editing: null,
  form: { name: "", code: "" },
  formErrors: {},
  confirmDelete: null,
  setConfirmDelete: vi.fn(),
  createMutation: { isPending: false },
  updateMutation: { isPending: false },
  deleteMutation: { mutate: vi.fn() },
  handleSubmit: vi.fn(),
  openEdit: vi.fn(),
  openCreate: vi.fn(),
  updateField: vi.fn(),
  refetch: vi.fn(),
};

vi.spyOn(useClientManagement, "useClientManagement").mockReturnValue(mockHook as any);

describe("ClientsPage", () => {
  beforeEach(() => {
    vi.spyOn(useClientManagement, "useClientManagement").mockReturnValue({
      ...mockHook,
      clients: null,
    } as any);
  });

  it("renders loading state", () => {
    vi.spyOn(useClientManagement, "useClientManagement").mockReturnValue({
      ...mockHook,
      isLoading: true,
    } as any);
    render(<ClientsPage />);
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders error state when clients is null", () => {
    render(<ClientsPage />);
    expect(screen.getByText("Failed to load clients")).toBeInTheDocument();
  });

  it("renders client table and add button", () => {
    vi.spyOn(useClientManagement, "useClientManagement").mockReturnValue({
      ...mockHook,
      clients: [],
    } as any);
    render(<ClientsPage />);
    expect(screen.getByText("Clients")).toBeInTheDocument();
    expect(screen.getByText("Add Client")).toBeInTheDocument();
  });

  it("renders active status as a pill badge, not plain text", () => {
    vi.spyOn(useClientManagement, "useClientManagement").mockReturnValue({
      ...mockHook,
      clients: [
        { id: 1, name: "MSC", code: "msc", description: "", is_active: true },
        { id: 2, name: "OLD", code: "old", description: "", is_active: false },
      ],
    } as any);
    const { container } = render(<ClientsPage />);
    const activeCell = screen.getByText("Yes").closest("td");
    expect(activeCell?.querySelector(".rounded-full")).not.toBeNull();
    expect(container.textContent).toContain("No");
  });

  it("opens create dialog", () => {
    vi.spyOn(useClientManagement, "useClientManagement").mockReturnValue({
      ...mockHook,
      clients: [],
    } as any);
    render(<ClientsPage />);
    fireEvent.click(screen.getByText("Add Client"));
    expect(mockHook.openCreate).toHaveBeenCalled();
  });
});
