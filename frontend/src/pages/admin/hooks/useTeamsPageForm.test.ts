import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTeamsPageForm } from "./useTeamsPageForm";
import type { Team } from "@/types";

const mockMutate = vi.fn();
const invalidate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: invalidate }),
  useMutation: ({ mutationFn, onSuccess, onError }: any) => ({
    mutate: (vars: any) => {
      mockMutate(vars);
      mutationFn(vars).then(onSuccess).catch(onError);
    },
    isPending: false,
  }),
}));

vi.mock("@/services/userService", () => ({
  userService: {
    createTeam: vi.fn(async (payload) => payload),
    updateTeam: vi.fn(async (id, payload) => ({ id, ...payload })),
    deleteTeam: vi.fn(async (id) => id),
    unarchiveTeam: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { userService } from "@/services/userService";

const baseTeam: Team = {
  id: 1,
  name: "Engineering",
  code: "ENG",
  description: "Engineering team",
  team_leader: { id: 2, username: "tl" },
  parent_team: 3,
  calendar_group: "Default",
} as Team;

describe("useTeamsPageForm", () => {
  it("initializes with closed form", () => {
    const { result } = renderHook(() => useTeamsPageForm());
    expect(result.current.formOpen).toBe(false);
    expect(result.current.editing).toBeNull();
  });

  it("opens create mode", () => {
    const { result } = renderHook(() => useTeamsPageForm());
    act(() => result.current.openCreate());
    expect(result.current.formOpen).toBe(true);
    expect(result.current.editing).toBeNull();
    expect(result.current.form.name).toBe("");
  });

  it("opens edit mode with team data", () => {
    const { result } = renderHook(() => useTeamsPageForm());
    act(() => result.current.openEdit(baseTeam));
    expect(result.current.formOpen).toBe(true);
    expect(result.current.editing).toBe(baseTeam);
    expect(result.current.form.name).toBe("Engineering");
    expect(result.current.form.team_leader_id).toBe("2");
    expect(result.current.form.parent_team).toBe("3");
  });

  it("handles team without optional fields", () => {
    const { result } = renderHook(() => useTeamsPageForm());
    act(() => result.current.openEdit({ id: 2, name: "Design", code: "DES" } as Team));
    expect(result.current.form.team_leader_id).toBe("");
    expect(result.current.form.parent_team).toBe("");
  });

  it("submits create when not editing", async () => {
    const { result } = renderHook(() => useTeamsPageForm());
    act(() => result.current.openCreate());
    act(() =>
      result.current.setForm({
        name: "QA",
        code: "QA",
        description: "",
        team_leader_id: "",
        parent_team: "",
        calendar_group: "",
      })
    );
    act(() =>
      result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent)
    );
    await waitFor(() => expect(mockMutate).toHaveBeenCalled());
  });

  it("refreshes the calendar group list after a team is created, edited or deleted", async () => {
    // The group picker reads this list; a stale copy hides a group the admin just created.
    for (const run of [
      (r: any) => r.current.create.mutate({ name: "A", code: "A" }),
      (r: any) => r.current.update.mutate({ id: 1, payload: {} }),
      (r: any) => r.current.deleteMutation.mutate(1),
    ]) {
      invalidate.mockClear();
      const { result } = renderHook(() => useTeamsPageForm());
      act(() => run(result));
      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "calendar-groups"] })
      );
    }
  });

  it("refreshes the Users page lists after a team is deleted or archived", async () => {
    // Archiving unassigns members; the Users page reads ["admin","profiles"] and ["admin","user-stats"].
    invalidate.mockClear();
    const { result } = renderHook(() => useTeamsPageForm());
    act(() => result.current.deleteMutation.mutate(1));
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "profiles"] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "user-stats"] });
    });
  });

  it("shows the server's reason when a team cannot be restored yet", async () => {
    const blockers = ['Its parent team "Alpha" is archived: restore the parent team first.'];
    vi.mocked(userService.unarchiveTeam).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { detail: "This team cannot be restored yet.", blockers } },
    });
    const { result } = renderHook(() => useTeamsPageForm());
    act(() => result.current.unarchiveMutation.mutate(5));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("This team cannot be restored yet", {
        description: blockers.join(" "),
      })
    );
  });
});
