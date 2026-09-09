import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

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

vi.mock("../hooks/useControlRoomAccessPage", () => ({
  useControlRoomAccessPage: () => ({
    accessList: [],
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
});
