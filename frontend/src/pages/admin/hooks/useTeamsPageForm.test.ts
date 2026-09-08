import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTeamsPageForm } from "./useTeamsPageForm";
import type { Team } from "@/types";

const mockMutate = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
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
  },
}));

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
});
