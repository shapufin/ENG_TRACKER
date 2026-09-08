import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SkillsHistoryPage } from "./SkillsHistoryPage";
import type { SkillRatingHistory, Skill } from "../types/skills";

const useHistoryMock = vi.fn();
const useSkillsMock = vi.fn();
const useUsersSearchMock = vi.fn();

vi.mock("@/components/layout/PageShell", () => ({
  PageShell: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock("@/components/ui/ErrorCard", () => ({
  ErrorCard: ({ title, onRetry }: { title: string; onRetry: () => void }) => (
    <div data-testid="error-card">
      <p>{title}</p>
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));

vi.mock("../hooks/useSkillsQueries", () => ({
  useHistory: (...args: unknown[]) => useHistoryMock(...args),
  useSkills: () => useSkillsMock(),
  useUsersSearch: (...args: unknown[]) => useUsersSearchMock(...args),
}));

vi.mock("../components/ProficiencyBadge", () => ({
  ProficiencyBadge: ({ level }: { level: number }) => (
    <span data-testid={`badge-${level}`}>L{level}</span>
  ),
}));

// Mock Select as simple interactive elements (project pattern).
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select">
      <span data-testid="select-value">{value ?? "all"}</span>
      <button onClick={() => onValueChange?.("10")}>select-python</button>
      <button onClick={() => onValueChange?.("all")}>select-all</button>
      {children}
    </div>
  ),
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children, id }: any) => <div id={id}>{children}</div>,
  SelectValue: ({ children }: any) => <div>{children}</div>,
}));

// Mock Popover to render content inline (always open).
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
}));

const makeEntry = (overrides: Partial<SkillRatingHistory> = {}): SkillRatingHistory => ({
  id: 1,
  user_skill: 1,
  user: 1,
  username: "alice",
  skill: 10,
  skill_name: "Python",
  old_level: 2,
  new_level: 4,
  changed_by: 1,
  changed_by_name: "alice",
  source: "self",
  changed_at: "2026-08-20T10:00:00Z",
  ...overrides,
});

const makeSkill = (overrides: Partial<Skill> = {}): Skill => ({
  id: 10,
  category: 1,
  category_name: "Backend",
  category_code: "backend",
  name: "Python",
  code: "python",
  description: "",
  is_active: true,
  created_at: "",
  updated_at: "",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  useHistoryMock.mockReturnValue({ data: { results: [], count: 0 }, isLoading: false });
  useSkillsMock.mockReturnValue({ data: [] });
  useUsersSearchMock.mockReturnValue({ data: undefined, isFetching: false });
});

describe("SkillsHistoryPage", () => {
  it("renders the page title", () => {
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Skill History")).toBeInTheDocument();
  });

  it("shows an empty state when no history exists", () => {
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/No history yet/i)).toBeInTheDocument();
  });

  it("shows a retryable error instead of an empty state when history loading fails", () => {
    const refetch = vi.fn();
    useHistoryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("offline"),
      refetch,
    });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Failed to load skill history/i)).toBeInTheDocument();
    expect(screen.queryByText(/No history yet/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("renders history entries with skill name and source", () => {
    useHistoryMock.mockReturnValue({
      data: { results: [makeEntry()], count: 1 },
      isLoading: false,
    });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText(/alice/)).toBeInTheDocument();
    expect(screen.getByText(/self/)).toBeInTheDocument();
  });

  it("allows long history metadata to wrap without horizontal overflow", () => {
    useHistoryMock.mockReturnValue({
      data: {
        results: [
          makeEntry({
            username: "a-very-long-username-that-needs-to-wrap",
            skill_name: "A very long skill name that needs to wrap",
          }),
        ],
        count: 1,
      },
      isLoading: false,
    });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    const skill = screen.getByText("A very long skill name that needs to wrap");
    const card = skill.closest("div.flex");
    expect(card).toHaveClass("flex-wrap");
    expect(skill.parentElement).toHaveClass("min-w-0");
    expect(screen.getByText("8/20/2026")).toHaveClass("shrink-0");
  });

  it("renders old and new level badges", () => {
    useHistoryMock.mockReturnValue({
      data: { results: [makeEntry({ old_level: 2, new_level: 4 })], count: 1 },
      isLoading: false,
    });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId("badge-2")).toBeInTheDocument();
    expect(screen.getByTestId("badge-4")).toBeInTheDocument();
  });

  it("shows pagination controls when count > 20", () => {
    useHistoryMock.mockReturnValue({
      data: { results: [makeEntry()], count: 50 },
      isLoading: false,
    });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Previous")).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it("disables Previous on the first page", () => {
    useHistoryMock.mockReturnValue({
      data: { results: [makeEntry()], count: 50 },
      isLoading: false,
    });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Previous")).toBeDisabled();
  });

  it("advances to the next page on click", () => {
    useHistoryMock.mockReturnValue({
      data: { results: [makeEntry()], count: 50 },
      isLoading: false,
    });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("Next"));
    expect(useHistoryMock).toHaveBeenLastCalledWith(undefined, undefined, 2, undefined, undefined);
  });

  it("shows 'Removed' for a delete entry with a previous level", () => {
    useHistoryMock.mockReturnValue({
      data: {
        results: [makeEntry({ old_level: 3, new_level: null })],
        count: 1,
      },
      isLoading: false,
    });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Removed")).toBeInTheDocument();
  });

  // ── Filter tests ──

  it("renders a skill filter dropdown with skill options", () => {
    useSkillsMock.mockReturnValue({
      data: [makeSkill({ id: 10, name: "Python" }), makeSkill({ id: 20, name: "React" })],
    });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
  });

  it("filters history by skill when a skill is selected", () => {
    useSkillsMock.mockReturnValue({ data: [makeSkill({ id: 10, name: "Python" })] });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    // Click the mocked select button that picks skill id=10.
    fireEvent.click(screen.getByText("select-python"));
    expect(useHistoryMock).toHaveBeenLastCalledWith(undefined, 10, 1, undefined, undefined);
  });

  it("resets to page 1 when skill filter changes", () => {
    useHistoryMock.mockReturnValue({
      data: { results: [makeEntry()], count: 50 },
      isLoading: false,
    });
    useSkillsMock.mockReturnValue({ data: [makeSkill({ id: 10 })] });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    // Go to page 2.
    fireEvent.click(screen.getByText("Next"));
    expect(useHistoryMock).toHaveBeenLastCalledWith(undefined, undefined, 2, undefined, undefined);
    // Change skill filter → page resets to 1.
    fireEvent.click(screen.getByText("select-python"));
    expect(useHistoryMock).toHaveBeenLastCalledWith(undefined, 10, 1, undefined, undefined);
  });

  it("clears skill filter back to all", () => {
    useSkillsMock.mockReturnValue({ data: [makeSkill({ id: 10 })] });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    // Select a skill.
    fireEvent.click(screen.getByText("select-python"));
    expect(useHistoryMock).toHaveBeenLastCalledWith(undefined, 10, 1, undefined, undefined);
    // Clear it.
    fireEvent.click(screen.getByText("select-all"));
    expect(useHistoryMock).toHaveBeenLastCalledWith(undefined, undefined, 1, undefined, undefined);
  });

  it("shows the result count in the history toolbar", () => {
    useHistoryMock.mockReturnValue({
      data: { results: [makeEntry()], count: 7 },
      isLoading: false,
    });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    expect(screen.getByText("7 results")).toBeInTheDocument();
  });

  it("clears all active filters with one toolbar action", () => {
    useSkillsMock.mockReturnValue({ data: [makeSkill({ id: 10 })] });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("select-python"));
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(useHistoryMock).toHaveBeenLastCalledWith(undefined, undefined, 1, undefined, undefined);
  });

  it("renders a user search input", () => {
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    expect(screen.getByPlaceholderText(/search by username/i)).toBeInTheDocument();
  });

  it("shows user search results when typing", () => {
    useUsersSearchMock.mockReturnValue({
      data: { results: [{ id: 5, username: "bob", email: "bob@test.com", full_name: "Bob" }] },
      isFetching: false,
    });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText(/search by username/i);
    fireEvent.change(input, { target: { value: "bob" } });
    expect(useUsersSearchMock).toHaveBeenCalled();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("filters history by user when a user is selected", () => {
    useUsersSearchMock.mockReturnValue({
      data: { results: [{ id: 5, username: "bob", email: "bob@test.com", full_name: "Bob" }] },
      isFetching: false,
    });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    // Type to search.
    fireEvent.change(screen.getByPlaceholderText(/search by username/i), {
      target: { value: "bob" },
    });
    // Click the user result.
    fireEvent.click(screen.getByText("bob"));
    expect(useHistoryMock).toHaveBeenLastCalledWith(5, undefined, 1, undefined, undefined);
  });

  it("clears user filter", () => {
    useUsersSearchMock.mockReturnValue({
      data: { results: [{ id: 5, username: "bob", email: "bob@test.com", full_name: "Bob" }] },
      isFetching: false,
    });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    // Select a user.
    fireEvent.change(screen.getByPlaceholderText(/search by username/i), {
      target: { value: "bob" },
    });
    fireEvent.click(screen.getByText("bob"));
    expect(useHistoryMock).toHaveBeenLastCalledWith(5, undefined, 1, undefined, undefined);
    // Clear the user filter.
    fireEvent.click(screen.getByLabelText(/clear user filter/i));
    expect(useHistoryMock).toHaveBeenLastCalledWith(undefined, undefined, 1, undefined, undefined);
  });

  it("shows 'Unknown user' when entry.username is null", () => {
    useHistoryMock.mockReturnValue({
      data: { results: [makeEntry({ username: null })], count: 1 },
      isLoading: false,
    });
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Unknown user/)).toBeInTheDocument();
  });

  it("passes dateFrom and dateTo to useHistory when date inputs change", () => {
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText(/from/i), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText(/to/i), { target: { value: "2026-08-31" } });
    expect(useHistoryMock).toHaveBeenLastCalledWith(
      undefined,
      undefined,
      1,
      "2026-01-01",
      "2026-08-31"
    );
  });

  it("clears date filters when Clear filters is clicked", () => {
    render(
      <MemoryRouter>
        <SkillsHistoryPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText(/from/i), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(useHistoryMock).toHaveBeenLastCalledWith(undefined, undefined, 1, undefined, undefined);
  });
});
