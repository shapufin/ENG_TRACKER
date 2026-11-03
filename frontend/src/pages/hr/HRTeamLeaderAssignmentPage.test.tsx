import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HRTeamLeaderAssignmentPage } from "./HRTeamLeaderAssignmentPage";
import type { UserProfile } from "@/types";

const useHRTeamLeaderAssignmentMock = vi.fn();

vi.mock("./hooks/useHRTeamLeaderAssignment", () => ({
  useHRTeamLeaderAssignment: () => useHRTeamLeaderAssignmentMock(),
}));

// Opens a picker by its accessible name and chooses an option.
const pick = (combobox: string, option: string | RegExp) => {
  fireEvent.click(screen.getByRole("combobox", { name: combobox }));
  fireEvent.click(screen.getByRole("option", { name: option }));
};

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

  it("summarises the listed employees by TL assignment", () => {
    useHRTeamLeaderAssignmentMock.mockReturnValue({
      ...defaultHookReturn,
      profiles: [
        makeProfile({ id: 1, italian_tl: 20 }),
        makeProfile({ id: 2, albanian_tl: 30 }),
        makeProfile({ id: 3, italian_tl: 20, albanian_tl: 30 }),
        makeProfile({ id: 4 }),
      ],
    });
    render(
      <MemoryRouter>
        <HRTeamLeaderAssignmentPage />
      </MemoryRouter>
    );
    const card = (label: string) => screen.getByText(label).parentElement?.textContent;
    expect(card("Assignable Employees")).toBe("Assignable Employees4");
    expect(card("With a Manager")).toBe("With a Manager2");
    expect(card("With a Line Manager")).toBe("With a Line Manager2");
    expect(card("Without any TL")).toBe("Without any TL1");
  });

  it("shows the full name with the username beneath it", () => {
    render(
      <MemoryRouter>
        <HRTeamLeaderAssignmentPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Alice A")).toBeInTheDocument();
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

  it("calls setTeamLeader with the profile id and role when a Manager option is picked", () => {
    const setTeamLeader = vi.fn();
    useHRTeamLeaderAssignmentMock.mockReturnValue({ ...defaultHookReturn, setTeamLeader });
    render(
      <MemoryRouter>
        <HRTeamLeaderAssignmentPage />
      </MemoryRouter>
    );
    pick("Manager for alice", /Bob TL/);
    expect(setTeamLeader).toHaveBeenCalledWith({
      profileId: 1,
      role: "italian_tl",
      teamLeaderUserId: 20,
    });
  });

  it("calls setTeamLeader with null when No TL is chosen for Line Manager", () => {
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
    pick("Line Manager for alice", "No TL");
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

  it("bulk-applies the chosen Manager to every selected profile in ONE call", async () => {
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

    pick("Bulk set Manager", /Bob TL/);

    // Nothing is written until the confirm dialog (count + leader) is accepted.
    expect(setTeamLeaderBulkAsync).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/2 employees/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Bob TL/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));

    // One batched call (one toast + one invalidation in the hook), and the
    // per-row mutation is never fanned out.
    await waitFor(() => expect(setTeamLeaderBulkAsync).toHaveBeenCalledTimes(1));
    expect(setTeamLeaderBulkAsync).toHaveBeenCalledWith([
      { profileId: 1, role: "italian_tl", teamLeaderUserId: 20 },
      { profileId: 2, role: "italian_tl", teamLeaderUserId: 20 },
    ]);
    expect(setTeamLeaderAsync).not.toHaveBeenCalled();
  });

  it("does not bulk-apply when the confirm dialog is cancelled", async () => {
    const setTeamLeaderBulkAsync = vi.fn().mockResolvedValue({ failed: 0, total: 1 });
    useHRTeamLeaderAssignmentMock.mockReturnValue({ ...defaultHookReturn, setTeamLeaderBulkAsync });
    render(
      <MemoryRouter>
        <HRTeamLeaderAssignmentPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText("Select row"));
    pick("Bulk set Line Manager", "No TL");

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Remove the Line Manager from 1 employee/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(setTeamLeaderBulkAsync).not.toHaveBeenCalled();
  });
});
