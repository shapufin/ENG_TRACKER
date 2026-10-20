import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const management = vi.hoisted(() => ({ isError: false }));

vi.mock("@/hooks/useUserManagement", () => ({
  useUserManagement: () => ({
    profiles: [],
    profilesCount: 0,
    teams: [],
    techs: [],
    techFacets: [],
    italianTLs: [],
    albanianTLs: [],
    isError: management.isError,
    updateMutation: {},
    createMutation: {},
    resetMutation: {},
    deleteMutation: {},
  }),
}));
vi.mock("./useUsersPageBulk", () => ({ useUsersPageBulk: () => ({ bulkUpdateMutation: {}, bulkDeleteMutation: {} }) }));
vi.mock("@/context/PluginContext", () => ({ usePlugins: () => ({ activePlugins: [] }) }));
vi.mock("@/context/PermissionContext", () => ({ usePermissions: () => ({}) }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

import { useUsersPage } from "./useUsersPage";

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe("useUsersPage paging", () => {
  beforeEach(() => {
    management.isError = false;
  });

  it("falls back to page 1 when the requested page no longer exists", () => {
    const { result, rerender } = renderHook(() => useUsersPage(), { wrapper });
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);

    management.isError = true;
    rerender();

    expect(result.current.page).toBe(1);
  });
});
