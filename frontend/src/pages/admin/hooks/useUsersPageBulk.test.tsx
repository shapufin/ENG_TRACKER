import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUsersPageBulk } from "./useUsersPageBulk";
import { userService } from "@/services/userService";
import type { UserProfile } from "@/types";

vi.mock("@/services/userService", () => ({
  userService: {
    bulkUpdateUsers: vi.fn(),
    bulkDeleteUsers: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/error-handler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/error-handler")>();
  return { ...actual, handleApiError: vi.fn() };
});

import { handleApiError } from "@/lib/error-handler";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const profile = { id: 1, user: { id: 10, username: "alice" } } as UserProfile;

describe("useUsersPageBulk — TL-revoke-blocked interception", () => {
  beforeEach(() => {
    vi.mocked(userService.bulkUpdateUsers).mockReset();
    vi.mocked(handleApiError).mockReset();
  });

  it("stores blocked_revocations from a 400 response instead of showing a generic toast", async () => {
    vi.mocked(userService.bulkUpdateUsers).mockRejectedValue({
      response: {
        status: 400,
        data: {
          error: "Cannot revoke...",
          blocked_revocations: [
            {
              user_id: 10,
              username: "alice",
              role: "italian_tl",
              dependents: [{ profile_id: 5, user_id: 20, username: "bob" }],
            },
          ],
        },
      },
    });

    const { result } = renderHook(
      () =>
        useUsersPageBulk({
          filteredData: [profile],
          rowSelection: { "1": true },
          onClearSelection: vi.fn(),
          onCloseDrawer: vi.fn(),
        }),
      { wrapper }
    );

    act(() => {
      result.current.handleBulkUpdate({ is_italian_tl_role: false });
    });

    await waitFor(() => expect(result.current.bulkBlockedRevocations).not.toBeNull());
    expect(result.current.bulkBlockedRevocations?.[0].username).toBe("alice");
    expect(handleApiError).not.toHaveBeenCalled();
  });

  it("falls through to handleApiError for a normal (non-blocked) error", async () => {
    vi.mocked(userService.bulkUpdateUsers).mockRejectedValue({
      response: { status: 400, data: { error: "Unknown team IDs" } },
    });

    const { result } = renderHook(
      () =>
        useUsersPageBulk({
          filteredData: [profile],
          rowSelection: { "1": true },
          onClearSelection: vi.fn(),
          onCloseDrawer: vi.fn(),
        }),
      { wrapper }
    );

    act(() => {
      result.current.handleBulkUpdate({ teams: [999] });
    });

    await waitFor(() => expect(handleApiError).toHaveBeenCalled());
    expect(result.current.bulkBlockedRevocations).toBeNull();
  });

  it("retryBlockedBulkUpdate re-submits the same payload that was blocked", async () => {
    vi.mocked(userService.bulkUpdateUsers)
      .mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            blocked_revocations: [
              { user_id: 10, username: "alice", role: "italian_tl", dependents: [] },
            ],
          },
        },
      })
      .mockResolvedValueOnce({ detail: "ok", updated_count: 1 });

    const onClearSelection = vi.fn();
    const { result } = renderHook(
      () =>
        useUsersPageBulk({
          filteredData: [profile],
          rowSelection: { "1": true },
          onClearSelection,
          onCloseDrawer: vi.fn(),
        }),
      { wrapper }
    );

    act(() => {
      result.current.handleBulkUpdate({ is_italian_tl_role: false });
    });
    await waitFor(() => expect(result.current.bulkBlockedRevocations).not.toBeNull());

    act(() => {
      result.current.retryBlockedBulkUpdate();
    });

    await waitFor(() => expect(onClearSelection).toHaveBeenCalled());
    expect(userService.bulkUpdateUsers).toHaveBeenCalledTimes(2);
    expect(userService.bulkUpdateUsers).toHaveBeenLastCalledWith({
      is_italian_tl_role: false,
      user_ids: [10],
    });
    expect(result.current.bulkBlockedRevocations).toBeNull();
  });
});
