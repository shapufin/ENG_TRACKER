import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});

afterEach(() => vi.unstubAllGlobals());
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ControlRoomAccessPage } from "./ControlRoomAccessPage";

// PluginImportButton (admin page headers) reads the active-plugin list. With
// data_import inactive it renders nothing — the same graceful path taken when
// the plugin is disabled or removed.
vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: [], isLoading: false }),
}));

const mockAccess = vi.hoisted(() => ({ list: [] as unknown[] }));

vi.mock("../hooks/useControlRoomAccessPage", () => ({
  useControlRoomAccessPage: () => ({
    accessList: mockAccess.list,
    teams: [],
    isLoading: false,
    isError: false,
    teamsError: null,
    accessError: null,
    selectedAccesses: [],
    rowSelection: {},
    setRowSelection: vi.fn(),
    setGrantOpen: vi.fn(),
    setCreateOpen: vi.fn(),
    setBulkError: vi.fn(),
    setBulkOpen: vi.fn(),
    setEditingAccess: vi.fn(),
    setRevokeAccess: vi.fn(),
    handleToggleActive: vi.fn(),
    handleBulkUpdate: vi.fn(),
    handleRevoke: vi.fn(),
    retryTeams: vi.fn(),
    retryAccess: vi.fn(),
    updateMutation: { isPending: false },
    deleteMutation: { isPending: false },
    bulkMutation: { isPending: false },
    grantOpen: false,
    createOpen: false,
    editingAccess: null,
    revokeAccess: null,
    bulkOpen: false,
    bulkError: undefined,
    deepLinkUserId: null,
  }),
}));

describe("ControlRoomAccessPage modernization", () => {
  it("uses semantic warning colors instead of raw amber backgrounds", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ControlRoomAccessPage />
      </QueryClientProvider>
    );

    const warning = screen.getByRole("status", { name: "Control Room visibility warning" });
    expect(warning.className).toContain("bg-warning/10");
    expect(warning.className).not.toContain("bg-amber-50");
  });

  it("filters access records with status chips", () => {
    const base = {
      email: "", first_name: "", last_name: "", phone: "", display_name: "", timezone: "UTC",
      team_scopes: [], team_ids: [], created_by: null, created_by_name: null,
      updated_by: null, updated_by_name: null, created_at: "2026-01-01", updated_at: "2026-01-01",
    };
    mockAccess.list = [
      { ...base, id: 1, user: 1, username: "alice", user_name: "Alice A", is_active: true },
      { ...base, id: 2, user: 2, username: "bobby", user_name: "Bob B", is_active: false },
    ];
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ControlRoomAccessPage />
      </QueryClientProvider>
    );
    const group = screen.getByRole("group", { name: "Status" });
    expect(within(group).getByRole("button", { name: /All/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Alice A")).toBeInTheDocument();
    expect(screen.getByText("Bob B")).toBeInTheDocument();

    fireEvent.click(within(group).getByRole("button", { name: /Inactive/ }));
    expect(screen.queryByText("Alice A")).not.toBeInTheDocument();
    expect(screen.getByText("Bob B")).toBeInTheDocument();
    mockAccess.list = [];
  });
});
