import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuggestedTeamMoves } from "./SuggestedTeamMoves";
import { userService } from "@/services/userService";
import type { TeamMoveSuggestion } from "@/types";

vi.mock("@/services/userService", () => ({ userService: { updateUser: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const acme = { id: 10, name: "Acme", code: "ACM", hours: 24 };
const beta = { id: 11, name: "Beta", code: "BET", hours: 0 };

const rows: TeamMoveSuggestion[] = [
  {
    user_id: 5,
    username: "ana",
    full_name: "Ana Alpha",
    current_teams: [{ id: 1, name: "Alpha", code: "ALP" }],
    recommendation: {
      team: { id: 2, name: "Gamma", code: "GAM" },
      has_approver: true,
      clients: [acme, beta],
      sharing: 2,
      team_hours: 120,
    },
    alternatives: [
      {
        team: { id: 4, name: "Delta", code: "DEL" },
        has_approver: false,
        clients: [acme],
        sharing: 1,
        team_hours: 0,
      },
    ],
    remaining_clients: [],
    basis: "overtime",
    person_hours: 24,
    lookback_days: 90,
  },
];

const renderRows = (data = rows) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SuggestedTeamMoves rows={data} />
    </QueryClientProvider>
  );

describe("SuggestedTeamMoves", () => {
  beforeEach(() => {
    vi.mocked(userService.updateUser).mockReset();
    vi.mocked(userService.updateUser).mockResolvedValue({} as never);
  });

  it("gives one row per person with their current team, the reason and one primary action", () => {
    renderRows();
    expect(screen.getAllByText("Ana Alpha")).toHaveLength(1);
    expect(screen.getByText(/Currently in Alpha/)).toBeInTheDocument();
    expect(screen.getByText("Acme · 24h")).toBeInTheDocument();
    expect(
      screen.getByText(/2 teammates already work Acme, Beta, 120h logged/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Ana Alpha to Gamma" })).toBeInTheDocument();
  });

  it("says when the evidence is only a client assignment", () => {
    renderRows([{ ...rows[0], basis: "assignment", person_hours: 0 }]);
    expect(screen.getByText(/no overtime logged, assignment only/)).toBeInTheDocument();
  });

  it("says when the person is in no team", () => {
    renderRows([{ ...rows[0], current_teams: [] }]);
    expect(screen.getByText(/Not in any team/)).toBeInTheDocument();
  });

  it("offers the alternatives as secondary choices and warns when nobody could approve that team", () => {
    renderRows();
    expect(screen.getByRole("button", { name: "Add Ana Alpha to Delta" })).toBeInTheDocument();
    expect(screen.getByText(/no approver yet/i)).toBeInTheDocument();
  });

  it("lists clients the recommended team does not cover", () => {
    renderRows([
      { ...rows[0], remaining_clients: [{ id: 12, name: "Zed", code: "ZED", hours: 0 }] },
    ]);
    expect(screen.getByText(/Still uncovered: Zed/)).toBeInTheDocument();
  });

  it("does nothing until Add is pressed, then sends only the team to add (the server merges)", async () => {
    renderRows();
    expect(userService.updateUser).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add Ana Alpha to Gamma" }));
    await waitFor(() => expect(userService.updateUser).toHaveBeenCalledWith(5, { add_teams: [2] }));
  });

  it("marks only the pressed button as adding while every button stays disabled", async () => {
    vi.mocked(userService.updateUser).mockReturnValue(new Promise(() => {}));
    renderRows();
    fireEvent.click(screen.getByRole("button", { name: "Add Ana Alpha to Gamma" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add Ana Alpha to Gamma" })).toHaveTextContent(
        "Adding"
      )
    );
    expect(screen.getByRole("button", { name: "Add Ana Alpha to Gamma" })).toBeDisabled();
    const other = screen.getByRole("button", { name: "Add Ana Alpha to Delta" });
    expect(other).toBeDisabled();
    expect(other).toHaveTextContent("Delta");
  });

  it("filters suggestions by externalSearch prop", () => {
    const multiple = [
      rows[0],
      {
        ...rows[0],
        user_id: 6,
        username: "bob",
        full_name: "Bob Beta",
        recommendation: {
          ...rows[0].recommendation,
          team: { id: 7, name: "Omega", code: "OMG" },
        },
      },
    ];
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SuggestedTeamMoves rows={multiple} externalSearch="Bob" />
      </QueryClientProvider>
    );
    expect(screen.getByText("Bob Beta")).toBeInTheDocument();
    expect(screen.queryByText("Ana Alpha")).not.toBeInTheDocument();
  });

  it("filters by basis when basis chips are clicked", () => {
    const multiple = [
      rows[0],
      {
        ...rows[0],
        user_id: 6,
        username: "bob",
        full_name: "Bob Beta",
        basis: "assignment" as const,
      },
      {
        ...rows[0],
        user_id: 7,
        username: "carl",
        full_name: "Carl Gamma",
        basis: "assignment" as const,
      },
      {
        ...rows[0],
        user_id: 8,
        username: "dan",
        full_name: "Dan Delta",
        basis: "overtime" as const,
      },
    ];
    renderRows(multiple);
    expect(screen.getByText("Bob Beta")).toBeInTheDocument();
    expect(screen.getByText("Ana Alpha")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Assignment only/ }));
    expect(screen.getByText("Bob Beta")).toBeInTheDocument();
    expect(screen.queryByText("Ana Alpha")).not.toBeInTheDocument();
  });

  it("paginates suggestions when exceeding page size", () => {
    const sixRows = Array.from({ length: 6 }, (_, i) => ({
      ...rows[0],
      user_id: 10 + i,
      username: `user_${i}`,
      full_name: `Employee ${i}`,
    }));
    renderRows(sixRows);
    expect(screen.getByText("Employee 0")).toBeInTheDocument();
    expect(screen.getByText("Employee 4")).toBeInTheDocument();
    expect(screen.queryByText("Employee 5")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next suggestions page" }));
    expect(screen.getByText("Employee 5")).toBeInTheDocument();
    expect(screen.queryByText("Employee 0")).not.toBeInTheDocument();
  });
});
