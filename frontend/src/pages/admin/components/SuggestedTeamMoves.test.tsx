import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuggestedTeamMoves } from "./SuggestedTeamMoves";
import { userService } from "@/services/userService";
import type { TeamMoveSuggestion } from "@/types";

vi.mock("@/services/userService", () => ({ userService: { updateUser: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const rows: TeamMoveSuggestion[] = [
  {
    user_id: 5,
    username: "ana",
    full_name: "Ana Alpha",
    team_ids: [1, 3],
    suggestions: [
      {
        client: { id: 10, name: "Acme", code: "ACM" },
        teams: [
          { id: 2, name: "Gamma", code: "GAM", sharing: 2 },
          { id: 4, name: "Delta", code: "DEL", sharing: 1 },
        ],
      },
    ],
  },
];

const renderRows = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SuggestedTeamMoves rows={rows} />
    </QueryClientProvider>
  );

describe("SuggestedTeamMoves", () => {
  beforeEach(() => {
    vi.mocked(userService.updateUser).mockReset();
    vi.mocked(userService.updateUser).mockResolvedValue({} as never);
  });

  it("describes the person, their client and each candidate team with its teammate count", () => {
    renderRows();
    expect(screen.getByText("Ana Alpha")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Ana Alpha to Gamma" })).toHaveTextContent("2 teammates");
    expect(screen.getByRole("button", { name: "Add Ana Alpha to Delta" })).toHaveTextContent("1 teammate");
  });

  it("does nothing until Add is pressed, then keeps the teams she already has", async () => {
    renderRows();
    expect(userService.updateUser).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add Ana Alpha to Gamma" }));
    await waitFor(() => expect(userService.updateUser).toHaveBeenCalledWith(5, { teams: [1, 3, 2] }));
  });
});
