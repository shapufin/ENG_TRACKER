import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataCheckPage } from "./DataCheckPage";
import { userService } from "@/services/userService";
import type { OrphanReport } from "@/types";

vi.mock("@/services/userService", () => ({
  userService: { getOrphans: vi.fn(), getTeamSuggestions: vi.fn() },
}));

const empty: OrphanReport = {
  users_without_team: [],
  teams_without_leader: [],
  empty_teams: [],
  unassigned_clients: [],
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <DataCheckPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe("DataCheckPage", () => {
  beforeEach(() => {
    vi.mocked(userService.getOrphans).mockReset();
    vi.mocked(userService.getTeamSuggestions).mockReset().mockResolvedValue([]);
  });

  it("says everything is linked when there is nothing to fix", async () => {
    vi.mocked(userService.getOrphans).mockResolvedValue(empty);
    renderPage();
    expect(await screen.findByText("Everything is linked")).toBeInTheDocument();
  });

  it("lists each problem under its own section with a count", async () => {
    vi.mocked(userService.getOrphans).mockResolvedValue({
      ...empty,
      users_without_team: [{ id: 1, username: "loner", full_name: "Lena Loner" }],
      teams_without_leader: [{ id: 2, name: "Alpha", code: "ALP", members_count: 3 }],
    });
    renderPage();
    expect(await screen.findByText("Lena Loner")).toBeInTheDocument();
    expect(screen.getByText("Alpha (ALP)")).toBeInTheDocument();
    expect(screen.getByText("3 members")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /People without a team/ })).toHaveTextContent("(1)");
    expect(screen.getByRole("heading", { name: /Empty teams/ })).toHaveTextContent("(0)");
  });

  it("offers a retry when the check cannot load", async () => {
    vi.mocked(userService.getOrphans).mockImplementation(() => Promise.reject(new Error("boom")));
    renderPage();
    expect(await screen.findByText("Failed to run the data check")).toBeInTheDocument();
  });

  it("shows suggested team moves even when the four checks are clean", async () => {
    vi.mocked(userService.getOrphans).mockResolvedValue(empty);
    vi.mocked(userService.getTeamSuggestions).mockResolvedValue([
      {
        user_id: 5,
        username: "ana",
        full_name: "Ana Alpha",
        team_ids: [1],
        suggestions: [
          {
            client: { id: 10, name: "Acme", code: "ACM" },
            teams: [{ id: 2, name: "Gamma", code: "GAM", sharing: 2 }],
          },
        ],
      },
    ]);
    renderPage();
    expect(await screen.findByRole("heading", { name: /Suggested team moves/ })).toBeInTheDocument();
    expect(screen.queryByText("Everything is linked")).not.toBeInTheDocument();
  });
});
