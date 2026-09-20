import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HRTeamLeaderAssignmentPage } from "./HRTeamLeaderAssignmentPage";
import type { UserProfile } from "@/types";

const useHRTeamLeaderAssignmentMock = vi.fn();

vi.mock("./hooks/useHRTeamLeaderAssignment", () => ({
  useHRTeamLeaderAssignment: () => useHRTeamLeaderAssignmentMock(),
}));

// Same simplified Select mock as TeamLeaderSelect.test.tsx — real Radix
// Select can't be reliably driven via fireEvent in JSDOM.
vi.mock("@/components/ui/select", () => {
  const SelectContext = React.createContext<{ onValueChange?: (value: string) => void }>({});
  return {
    Select: ({ children, onValueChange }: any) => (
      <SelectContext.Provider value={{ onValueChange }}>{children}</SelectContext.Provider>
    ),
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ value, children }: any) => {
      const context = React.useContext(SelectContext);
      return (
        <button type="button" role="option" onClick={() => context.onValueChange?.(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children, "aria-label": ariaLabel }: any) => (
      <button type="button" role="combobox" aria-label={ariaLabel}>
        {children}
      </button>
    ),
    SelectValue: ({ children, placeholder }: any) => <span>{children || placeholder}</span>,
  };
});

const makeProfile = (overrides: Partial<UserProfile> = {}): UserProfile =>
  ({
    id: 1,
    user: { id: 10, username: "alice", email: "", first_name: "Alice", last_name: "A" },
    team: null,
    teams: [],
    techs: [],
    albanian_tl: null,
    italian_tl: null,
    is_hr_user: false,
    phone: "",
    hire_date: null,
    groups: [],
    created_at: "",
    updated_at: "",
    ...overrides,
  }) as UserProfile;

const defaultHookReturn = {
  profiles: [makeProfile()],
  isLoading: false,
  techFacets: [],
  noTechCount: 0,
  techIds: [],
  techLevelIds: [],
  noTechOnly: false,
  setTechIds: vi.fn(),
  setTechLevelIds: vi.fn(),
  setNoTechOnly: vi.fn(),
  italianTLs: [{ id: 20, full_name: "Bob TL" }],
  albanianTLs: [{ id: 30, full_name: "Carol TL" }],
  setTeamLeader: vi.fn(),
  setTeamLeaderAsync: vi.fn().mockResolvedValue({}),
  setTeamLeaderBulkAsync: vi.fn().mockResolvedValue({ failed: 0, total: 0 }),
  isSaving: false,
};

describe("HRTeamLeaderAssignmentPage", () => {
  beforeEach(() => {
    useHRTeamLeaderAssignmentMock.mockReturnValue({ ...defaultHookReturn });
    // DataTable observes its scroll container; JSDOM has no ResizeObserver.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
  });

  it("renders the page title and the user list", () => {
    render(
      <MemoryRouter>
        <HRTeamLeaderAssignmentPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Team Leader Assignment")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("shows a loading state instead of the table while fetching", () => {
    useHRTeamLeaderAssignmentMock.mockReturnValue({ ...defaultHookReturn, isLoading: true });
    render(
      <MemoryRouter>
        <HRTeamLeaderAssignmentPage />
      </MemoryRouter>
    );
    expect(screen.queryByText("alice")).not.toBeInTheDocument();
  });

  it("calls setTeamLeader with the profile id and role when an Italian TL option is picked", () => {
    const setTeamLeader = vi.fn();
    useHRTeamLeaderAssignmentMock.mockReturnValue({ ...defaultHookReturn, setTeamLeader });
    render(
      <MemoryRouter>
        <HRTeamLeaderAssignmentPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("option", { name: "Bob TL" }));
    expect(setTeamLeader).toHaveBeenCalledWith({
      profileId: 1,
      role: "italian_tl",
      teamLeaderUserId: 20,
    });
  });

  it("calls setTeamLeader with null when No TL is chosen for Albanian TL", () => {
    const setTeamLeader = vi.fn();
    useHRTeamLeaderAssignmentMock.mockReturnValue({
      ...defaultHookReturn,
      profiles: [makeProfile({ albanian_tl: 30 })],
      setTeamLeader,
    });
    render(
      <MemoryRouter>
        <HRTeamLeaderAssignmentPage />
      </MemoryRouter>
    );
    const albanianCell = screen
      .getByRole("combobox", { name: "Albanian TL for alice" })
      .closest("td") as HTMLElement;
    fireEvent.click(within(albanianCell).getByRole("option", { name: "No TL" }));
    expect(setTeamLeader).toHaveBeenCalledWith({
      profileId: 1,
      role: "albanian_tl",
      teamLeaderUserId: null,
    });
  });

  it("shows a bulk action bar once a row is selected, and hides it when cleared", () => {
    render(
      <MemoryRouter>
        <HRTeamLeaderAssignmentPage />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText("1 selected")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Select row"));
    expect(screen.getByLabelText("1 selected")).toBeInTheDocument();
  });

  it("bulk-applies the chosen Italian TL to every selected profile in ONE call", async () => {
    const setTeamLeaderBulkAsync = vi.fn().mockResolvedValue({ failed: 0, total: 2 });
    const setTeamLeaderAsync = vi.fn();
    useHRTeamLeaderAssignmentMock.mockReturnValue({
      ...defaultHookReturn,
      profiles: [
        makeProfile({ id: 1, user: { id: 10, username: "alice" } as UserProfile["user"] }),
        makeProfile({ id: 2, user: { id: 11, username: "zara" } as UserProfile["user"] }),
      ],
      setTeamLeaderAsync,
      setTeamLeaderBulkAsync,
    });
    render(
      <MemoryRouter>
        <HRTeamLeaderAssignmentPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText("Select all rows on this page"));
    expect(screen.getByLabelText("2 selected")).toBeInTheDocument();

    const bulkItalianCombobox = screen.getByRole("combobox", { name: "Bulk set Italian TL" });
    const bulkItalianContainer = bulkItalianCombobox.closest("div") as HTMLElement;
    fireEvent.click(within(bulkItalianContainer).getByRole("option", { name: "Bob TL" }));

    // One batched call (one toast + one invalidation in the hook), and the
    // per-row mutation is never fanned out.
    await waitFor(() => expect(setTeamLeaderBulkAsync).toHaveBeenCalledTimes(1));
    expect(setTeamLeaderBulkAsync).toHaveBeenCalledWith([
      { profileId: 1, role: "italian_tl", teamLeaderUserId: 20 },
      { profileId: 2, role: "italian_tl", teamLeaderUserId: 20 },
    ]);
    expect(setTeamLeaderAsync).not.toHaveBeenCalled();
  });
});
