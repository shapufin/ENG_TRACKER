import React from "react";
import { render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useUserColumns } from "./useUserColumns";
import type { UserProfile } from "@/types";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

const profile = (overrides: Partial<UserProfile> = {}) =>
  ({
    id: 1,
    user: {
      id: 7,
      username: "alice",
      email: "alice@example.com",
    },
    team: null,
    teams: [],
    albanian_tl: null,
    italian_tl: null,
    is_hr_user: false,
    is_italian_tl_role: false,
    is_albanian_tl_role: false,
    phone: "",
    hire_date: null,
    groups: [],
    created_at: "",
    updated_at: "",
    ...overrides,
  }) as UserProfile;

describe("useUserColumns", () => {
  it("renders the combined TL role without changing column construction", () => {
    const { result } = renderHook(() =>
      useUserColumns(vi.fn(), vi.fn(), vi.fn(), {
        crActive: true,
      })
    );
    const column = result.current.find((item) => item.id === "tl_role");
    const cell = column?.cell as (context: { row: { original: UserProfile } }) => React.ReactNode;

    render(
      <>
        {cell({
          row: { original: profile({ is_italian_tl_role: true, is_albanian_tl_role: true }) },
        })}
      </>
    );

    expect(screen.getByText("IT")).toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("renders CR scope teams from the latest access map", () => {
    const { result } = renderHook(() =>
      useUserColumns(vi.fn(), vi.fn(), vi.fn(), {
        crActive: true,
        crAccessByUserId: new Map([
          [7, { team_scopes: [{ id: 3, team_name: "Team A" }] } as never],
        ]),
      })
    );
    const column = result.current.find((item) => item.id === "cr_teams");
    const cell = column?.cell as (context: { row: { original: UserProfile } }) => React.ReactNode;

    render(<>{cell({ row: { original: profile() } })}</>);

    expect(screen.getByText("Team A")).toBeInTheDocument();
  });

  it("renders Tech badges from techs_detail", () => {
    const { result } = renderHook(() => useUserColumns(vi.fn(), vi.fn(), vi.fn()));
    const column = result.current.find((item) => item.id === "techs");
    const cell = column?.cell as (context: { row: { original: UserProfile } }) => React.ReactNode;

    render(
      <>
        {cell({
          row: {
            original: profile({
              techs: [1, 2],
              techs_detail: [
                { id: 1, name: "Infrastructure", code: "INFRA", is_active: true },
                { id: 2, name: "Database", code: "DB", is_active: true },
              ],
            }),
          },
        })}
      </>
    );

    expect(screen.getByText("Infrastructure")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
  });

  it("renders em-dash when user has no Tech assignments", () => {
    const { result } = renderHook(() => useUserColumns(vi.fn(), vi.fn(), vi.fn()));
    const column = result.current.find((item) => item.id === "techs");
    const cell = column?.cell as (context: { row: { original: UserProfile } }) => React.ReactNode;

    render(<>{cell({ row: { original: profile({ techs: [], techs_detail: [] }) } })}</>);

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
