import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClientsPage } from "./ClientsPage";
import * as useClientManagement from "./hooks/useClientManagement";

// Plugin-driven buttons and the onboarding slot read the active-plugin list. With
// none active they render nothing, the same path taken when a plugin is disabled.
vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: [], isLoading: false }),
}));
const permissions = vi.hoisted(() => ({ isSuperuser: true }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permissions }));
vi.mock("@/services/overtimeService", () => ({
  overtimeService: {
    getClientLifecycle: vi.fn().mockResolvedValue({
      is_active: true,
      assigned_users: 3,
      counts: {},
      cascade_counts: {},
      last_activity: null,
      can_delete: false,
      blockers: [],
    }),
  },
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, "ResizeObserver", { value: ResizeObserverMock, writable: true });

const active = { id: 1, name: "MSC", code: "msc", description: "", is_active: true };
const archived = { id: 2, name: "OLD", code: "old", description: "", is_active: false };

const mockHook = {
  clients: null,
  isLoading: false,
  formOpen: false,
  setFormOpen: vi.fn(),
  editing: null,
  form: { name: "", code: "" },
  formErrors: {},
  archiveTarget: null,
  setArchiveTarget: vi.fn(),
  lifecycleTarget: null,
  setLifecycleTarget: vi.fn(),
  createMutation: { isPending: false },
  updateMutation: { isPending: false },
  archiveMutation: { mutate: vi.fn(), isPending: false },
  unarchiveMutation: { mutate: vi.fn(), isPending: false },
  deleteMutation: { mutate: vi.fn(), isPending: false },
  handleSubmit: vi.fn(),
  openEdit: vi.fn(),
  openCreate: vi.fn(),
  updateField: vi.fn(),
  refetch: vi.fn(),
};

const withHook = (overrides: Record<string, unknown> = {}) =>
  vi
    .spyOn(useClientManagement, "useClientManagement")
    .mockReturnValue({ ...mockHook, ...overrides } as any);

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ClientsPage />
    </QueryClientProvider>
  );

describe("ClientsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions.isSuperuser = true;
    withHook();
  });

  it("renders loading state", () => {
    withHook({ isLoading: true });
    renderPage();
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders error state when clients is null", () => {
    renderPage();
    expect(screen.getByText("Failed to load clients")).toBeInTheDocument();
  });

  it("renders client table and add button", () => {
    withHook({ clients: [] });
    renderPage();
    expect(screen.getByText("Clients")).toBeInTheDocument();
    expect(screen.getByText("Add Client")).toBeInTheDocument();
  });

  it("opens create dialog", () => {
    withHook({ clients: [] });
    renderPage();
    fireEvent.click(screen.getByText("Add Client"));
    expect(mockHook.openCreate).toHaveBeenCalled();
  });

  it("shows active clients by default and archived ones under the Archived chip", () => {
    withHook({ clients: [active, archived] });
    renderPage();
    expect(screen.getByText("MSC")).toBeInTheDocument();
    expect(screen.queryByText("OLD")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Archived/ }));
    expect(screen.getByText("OLD")).toBeInTheDocument();
    expect(screen.queryByText("MSC")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(screen.getByText("MSC")).toBeInTheDocument();
    expect(screen.getByText("OLD")).toBeInTheDocument();
  });

  it("labels the status as a pill: Active or Archived", () => {
    withHook({ clients: [active, archived] });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    const activeCell = screen.getByText("Active", { selector: "td *" }).closest("td");
    expect(activeCell?.querySelector(".rounded-full")).not.toBeNull();
    expect(screen.getByText("Archived", { selector: "td *" })).toBeInTheDocument();
  });

  it("lets a superuser archive an active client", () => {
    withHook({ clients: [active] });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Archive MSC" }));
    expect(mockHook.setArchiveTarget).toHaveBeenCalledWith(active);
  });

  it("never offers a delete button on the list", () => {
    withHook({ clients: [active, archived] });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
  });

  it("lets a superuser restore an archived client and open its archived data", () => {
    withHook({ clients: [archived] });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Archived/ }));
    fireEvent.click(screen.getByRole("button", { name: "Unarchive OLD" }));
    expect(mockHook.unarchiveMutation.mutate).toHaveBeenCalledWith(2, {
      onSuccess: expect.any(Function),
    });
    fireEvent.click(screen.getByRole("button", { name: "Archived data OLD" }));
    expect(mockHook.setLifecycleTarget).toHaveBeenCalledWith(archived);
  });

  it("hides every lifecycle action from staff who are not superusers", () => {
    permissions.isSuperuser = false;
    withHook({ clients: [active, archived] });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(screen.getAllByRole("button", { name: /^Edit/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /^Archive / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Unarchive/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Archived data/ })).not.toBeInTheDocument();
  });

  it("explains what archiving does, with the number of users it unassigns", async () => {
    withHook({ clients: [active], archiveTarget: active });
    renderPage();
    expect(await screen.findByText(/3 users will be unassigned/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archive client" }));
    expect(mockHook.archiveMutation.mutate).toHaveBeenCalledWith(1, {
      onSuccess: expect.any(Function),
    });
  });

  it("follows a just-archived client to the Archived view instead of dropping it", () => {
    withHook({ clients: [active, archived], archiveTarget: active });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Archive client" }));
    const [, options] = mockHook.archiveMutation.mutate.mock.calls[0];
    act(() => options.onSuccess());
    // The default view is Active, so without the switch the row would vanish.
    expect(screen.getByText("OLD")).toBeInTheDocument();
    expect(screen.queryByText("MSC")).not.toBeInTheDocument();
  });

  it("follows a just-restored client back to the Active view", () => {
    withHook({ clients: [active, archived] });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Archived/ }));
    fireEvent.click(screen.getByRole("button", { name: "Unarchive OLD" }));
    const [, options] = mockHook.unarchiveMutation.mutate.mock.calls[0];
    act(() => options.onSuccess());
    expect(screen.getByText("MSC")).toBeInTheDocument();
    expect(screen.queryByText("OLD")).not.toBeInTheDocument();
  });
});
