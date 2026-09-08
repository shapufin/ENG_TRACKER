import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { createWrapper } from "@/test/hookTestUtils";
import { useClientAssignment } from "./useClientAssignment";
import { overtimeService } from "@/services/overtimeService";
import { userService } from "@/services/userService";

vi.mock("@/services/overtimeService", () => ({
  overtimeService: { getAvailableClients: vi.fn() },
}));
vi.mock("@/services/userService", () => ({
  userService: { getMyTeamMembers: vi.fn(), assignMemberClients: vi.fn() },
}));
vi.mock("@/lib/error-handler", () => ({ handleApiError: vi.fn() }));

const clients = [
  { id: 1, name: "SIAE", code: "SIAE" },
  { id: 2, name: "MSC", code: "MSC" },
];

const profile = (id: number, username: string, assigned: number[]) =>
  ({
    id,
    user: { id, username, first_name: "", last_name: "" },
    clients: assigned,
  }) as any;

const setup = (members: any[]) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(overtimeService.getAvailableClients).mockResolvedValue(clients as any);
  vi.mocked(userService.getMyTeamMembers).mockResolvedValue(members);
  vi.mocked(userService.assignMemberClients).mockResolvedValue({} as any);
  const utils = renderHook(() => useClientAssignment(), { wrapper: createWrapper(qc) });
  return { qc, ...utils };
};

beforeEach(() => vi.clearAllMocks());

describe("useClientAssignment", () => {
  it("maps 0/1/N assigned clients to None/single/Multiple drafts", async () => {
    const { result } = setup([
      profile(1, "alice", []),
      profile(2, "bob", [1]),
      profile(3, "cara", [1, 2]),
    ]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.effective[1]).toBeNull();
    expect(result.current.effective[2]).toBe(1);
    expect(result.current.effective[3]).toBeUndefined();
    expect(result.current.isDirty).toBe(false);
  });

  it("saves only dirty rows with single-id-or-empty payloads", async () => {
    const { result } = setup([profile(1, "alice", []), profile(2, "bob", [1])]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setDraft(1, 2));
    expect(result.current.isDirty).toBe(true);
    await act(async () => result.current.saveAll());
    expect(userService.assignMemberClients).toHaveBeenCalledTimes(1);
    expect(userService.assignMemberClients).toHaveBeenCalledWith(1, [2]);
  });

  it("sends empty list when a row is cleared to None", async () => {
    const { result } = setup([profile(2, "bob", [1])]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setDraft(2, null));
    await act(async () => result.current.saveAll());
    expect(userService.assignMemberClients).toHaveBeenCalledWith(2, []);
  });

  it("does not call the API when pristine", async () => {
    const { result } = setup([profile(1, "alice", [1])]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => result.current.saveAll());
    expect(userService.assignMemberClients).not.toHaveBeenCalled();
  });

  it("refreshes team members and form client scope after save", async () => {
    const { result, qc } = setup([profile(1, "alice", [])]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const spy = vi.spyOn(qc, "invalidateQueries");
    act(() => result.current.setDraft(1, 1));
    await act(async () => result.current.saveAll());
    expect(spy).toHaveBeenCalledWith({ queryKey: ["team", "members"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["overtime", "clients"] });
  });
});
