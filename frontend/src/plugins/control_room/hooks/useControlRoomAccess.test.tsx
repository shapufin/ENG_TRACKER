import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { controlRoomService } from "../services/controlRoomService";
import {
  useCreateControlRoomAccess,
  useCreateCRUser,
  useUpdateCRUser,
} from "./useControlRoomAccess";
import { createWrapper } from "@/test/hookTestUtils";

describe("useControlRoomAccess user mutations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invalidates the Users page profile query after granting existing-user access", async () => {
    vi.spyOn(controlRoomService, "createAccess").mockResolvedValue({} as never);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateControlRoomAccess(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ user: 7, team_ids: [1] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["admin", "profiles"],
    });
  });

  it("invalidates the Users page profile query after creating a CR user", async () => {
    vi.spyOn(controlRoomService, "createCRUser").mockResolvedValue({} as never);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateCRUser(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        username: "newcr",
        email: "newcr@example.com",
        password: "secret123",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["admin", "profiles"],
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ["users"],
    });
  });

  it("invalidates the Users page profile query after updating a CR user", async () => {
    vi.spyOn(controlRoomService, "updateCRUser").mockResolvedValue({} as never);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateCRUser(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ user_id: 1, first_name: "Updated" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["admin", "profiles"],
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ["users"],
    });
  });
});
