import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AutoMatchReview } from "./AutoMatchReview";

const queryHook = vi.fn();
const mutationHook = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => queryHook(...args),
  useMutation: (...args: unknown[]) => mutationHook(...args),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: () => ({ canManage: () => true }),
}));
vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => ({ isTeamLeader: true, isAdmin: false, isSuperuser: false }),
}));

describe("AutoMatchReview", () => {
  beforeEach(() => {
    queryHook.mockReturnValue({ data: [], isLoading: false });
    mutationHook.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("does not render when there are no pending matches", () => {
    render(<AutoMatchReview />);
    expect(screen.queryByText("Pending KPI ticket matches")).not.toBeInTheDocument();
  });

  it("allows a TL to confirm or reject a pending match", () => {
    const mutate = vi.fn();
    queryHook.mockReturnValue({
      data: [
        {
          id: 3,
          ticket_id: "INC-3",
          overtime_user: "member",
          overtime_date: "2026-03-10",
          overtime_hours: "2.00",
        },
      ],
      isLoading: false,
    });
    mutationHook.mockReturnValue({ mutate, isPending: false });

    render(<AutoMatchReview />);
    expect(screen.getByText("Pending KPI ticket matches")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm match INC-3" }));
    expect(mutate).toHaveBeenCalledWith({ id: 3, decision: "confirmed" });
  });
});
