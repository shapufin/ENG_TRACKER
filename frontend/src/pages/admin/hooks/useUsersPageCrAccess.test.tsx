import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const profiles = vi.hoisted(() => [{ user: { id: 1 } }, { user: { id: 2 } }]);

vi.mock("@/hooks/useUserManagement", () => ({
  useUserManagement: () => ({
    profiles,
    profilesCount: 2,
    teams: [],
    techs: [],
    techFacets: [],
    italianTLs: [],
    albanianTLs: [],
    isError: false,
    error: null,
    updateMutation: {},
    createMutation: {},
    resetMutation: {},
    deleteMutation: {},
  }),
}));
vi.mock("./useUsersPageBulk", () => ({
  useUsersPageBulk: () => ({ bulkUpdateMutation: {}, bulkDeleteMutation: {} }),
}));
vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: [{ name: "control_room" }] }),
}));
vi.mock("@/context/PermissionContext", () => ({ usePermissions: () => ({}) }));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: [
        { user: 1, is_active: true },
        { user: 2, is_active: false },
      ],
    }),
  },
}));

import api from "@/lib/api";
import { useUsersPage } from "./useUsersPage";

describe("useUsersPage control room access", () => {
  beforeEach(() => vi.mocked(api.get).mockClear());

  it("serves the cached access lookup on remount and derives the active set", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );

    const first = renderHook(() => useUsersPage(), { wrapper });
    await waitFor(() => expect([...first.result.current.crAccessUserIds]).toEqual([1]));
    first.unmount();

    // Remount shows the cached lookup immediately instead of an empty badge flash.
    const second = renderHook(() => useUsersPage(), { wrapper });
    expect([...second.result.current.crAccessUserIds]).toEqual([1]);
    expect(second.result.current.crAccessByUserId.size).toBe(2);
  });
});
