import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockInvalidate = vi.fn();
const mockMutate = vi.fn();
const mockNavigate = vi.fn();
const mockSetSearchParams = vi.fn();

// Mutable search params so individual tests can control URL state.
let currentSearchParams = new URLSearchParams();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("@/services/permissionService", () => ({
  permissionService: {
    getGroups: vi.fn(),
    getAllGroups: vi.fn(),
    getGroup: vi.fn(),
    getUserGroups: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    createUserGroup: vi.fn(),
    deleteUserGroup: vi.fn(),
    getMemberCandidates: vi.fn(),
  },
}));

vi.mock("@/services/userService", () => ({
  userService: { getProfiles: vi.fn() },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [currentSearchParams, mockSetSearchParams],
}));

vi.mock("@/lib/error-handler", () => ({
  handleApiError: vi.fn(),
}));

// Mock the dialog so we can control its render and simulate submission.
vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: (props: any) => {
    if (!props.open) return null;
    return (
      <div data-testid="bulk-delete-dialog">
        <h2>{props.title}</h2>
        <p>{props.description}</p>
        {props.children}
        <button data-testid="bulk-delete-confirm" onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
      </div>
    );
  },
}));

vi.mock("./components/ResourceAccessGroupDialog", () => ({
  ResourceAccessGroupDialog: (props: any) => {
    if (!props.open) return null;
    return (
      <div data-testid="group-dialog">
        <button
          data-testid="dialog-submit"
          onClick={() => props.onSubmit({ name: "New", code: "NEW", description: "" })}
        >
          Submit
        </button>
        <button data-testid="dialog-cancel" onClick={() => props.onOpenChange(false)}>
          Cancel
        </button>
        {props.errorMessage && <span data-testid="dialog-error">{props.errorMessage}</span>}
      </div>
    );
  },
}));

import { useQuery, useMutation } from "@tanstack/react-query";
import { ResourceAccessPage } from "./ResourceAccessPage";

const group = {
  id: 1,
  name: "Analytics Viewers",
  code: "ANALYTICS",
  description: "Read-only analytics access",
  member_count: 5,
  plugin_access: [{ plugin_name: "analytics", action: "view" }],
};

function setup({
  isLoading = false,
  isError = false,
  empty = false,
  data,
}: {
  isLoading?: boolean;
  isError?: boolean;
  empty?: boolean;
  data?: unknown;
} = {}) {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useQuery).mockImplementation((options: any) => {
    const key = options.queryKey;
    if (key[1] === "groups") {
      if (isLoading)
        return {
          data: undefined,
          isLoading: true,
          isError: false,
          isFetching: true,
          refetch: vi.fn(),
        } as any;
      if (isError)
        return {
          data: undefined,
          isLoading: false,
          isError: true,
          isFetching: false,
          refetch: vi.fn(),
        } as any;
      if (empty)
        return {
          data: { count: 0, results: [], next: null, previous: null },
          isLoading: false,
          isError: false,
          isFetching: false,
          refetch: vi.fn(),
        } as any;
      return {
        data: data ?? { count: 1, results: [group], next: null, previous: null },
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
      } as any;
    }
    return { data: undefined, isLoading: false, isError: false } as any;
  });
  vi.mocked(useMutation).mockReset();
  vi.mocked(useMutation).mockImplementation(
    () => ({ mutate: mockMutate, isPending: false, mutateAsync: vi.fn() }) as any
  );
}

describe("ResourceAccessPage (directory)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearchParams = new URLSearchParams();
  });

  it("renders the directory header and summary metrics", () => {
    setup();
    render(<ResourceAccessPage />);

    expect(screen.getByRole("heading", { name: "Resource access" })).toBeInTheDocument();
    expect(screen.getByText("Least-privilege access")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders group rows with name, code, and member count", () => {
    setup();
    render(<ResourceAccessPage />);

    expect(screen.getAllByText("Analytics Viewers").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ANALYTICS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
  });

  it("shows plugin access details before deleting selected groups", () => {
    setup();
    render(<ResourceAccessPage />);

    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select Analytics Viewers" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete 1 selected group" }));

    expect(screen.getByTestId("bulk-delete-dialog")).toBeInTheDocument();
    expect(screen.getByText("analytics")).toBeInTheDocument();
    expect(screen.getByText(/view/)).toBeInTheDocument();
  });

  it("submits selected group IDs to bulk deletion", () => {
    setup();
    render(<ResourceAccessPage />);

    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select Analytics Viewers" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete 1 selected group" }));
    fireEvent.click(screen.getByTestId("bulk-delete-confirm"));

    expect(mockMutate).toHaveBeenCalledWith([1], expect.any(Object));
  });

  it("navigates to group detail when Manage is clicked", () => {
    setup();
    render(<ResourceAccessPage />);

    const manageBtns = screen.getAllByRole("button", { name: "Manage Analytics Viewers" });
    fireEvent.click(manageBtns[0]);

    expect(mockNavigate).toHaveBeenCalledWith("/admin/resource-access/groups/1");
  });

  it("shows empty system state with create CTA when no groups exist", () => {
    setup({ empty: true });
    render(<ResourceAccessPage />);

    expect(screen.getByText("No access groups yet")).toBeInTheDocument();
    expect(screen.getByText("Create your first group")).toBeInTheDocument();
  });

  it("shows empty search state when search yields no results", () => {
    currentSearchParams = new URLSearchParams("search=nonexistent");
    setup({ empty: true }); // empty results
    render(<ResourceAccessPage />);

    expect(screen.getByText("No groups match your search")).toBeInTheDocument();
    expect(screen.getByText(/nonexistent/)).toBeInTheDocument();
  });

  it("shows a loading state while groups are loading", () => {
    setup({ isLoading: true });
    render(<ResourceAccessPage />);

    expect(screen.getByText("Loading resource access")).toBeInTheDocument();
  });

  it("shows an error state when groups fail to load", () => {
    setup({ isError: true });
    render(<ResourceAccessPage />);

    expect(screen.getByText("We couldn't load resource access")).toBeInTheDocument();
  });

  it("renders the Create group button", () => {
    setup();
    render(<ResourceAccessPage />);

    expect(screen.getByRole("button", { name: /Create group/ })).toBeInTheDocument();
  });

  it("opens the create dialog when Create group is clicked", () => {
    setup();
    render(<ResourceAccessPage />);

    fireEvent.click(screen.getByRole("button", { name: /Create group/ }));

    expect(screen.getByTestId("group-dialog")).toBeInTheDocument();
  });

  it("calls mutate with correct values when dialog submits", () => {
    setup();
    render(<ResourceAccessPage />);

    fireEvent.click(screen.getByRole("button", { name: /Create group/ }));
    fireEvent.click(screen.getByTestId("dialog-submit"));

    expect(mockMutate).toHaveBeenCalledWith(
      { name: "New", code: "NEW", description: "" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it("closes the dialog when cancel is clicked", () => {
    setup();
    render(<ResourceAccessPage />);

    fireEvent.click(screen.getByRole("button", { name: /Create group/ }));
    expect(screen.getByTestId("group-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("dialog-cancel"));
    expect(screen.queryByTestId("group-dialog")).not.toBeInTheDocument();
  });

  it("search input updates URL search params", () => {
    setup();
    render(<ResourceAccessPage />);

    const searchInput = screen.getByRole("searchbox", { name: "Search groups" });
    fireEvent.change(searchInput, { target: { value: "analytics" } });

    expect(mockSetSearchParams).toHaveBeenCalled();
  });

  it("clear search button is visible when search has text", () => {
    currentSearchParams = new URLSearchParams("search=analytics");
    setup();
    render(<ResourceAccessPage />);

    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
  });

  it("visually marks selected groups with the selected-item ring", () => {
    setup();
    render(<ResourceAccessPage />);

    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select Analytics Viewers" })[0]);

    expect(screen.getAllByText("Analytics Viewers")[0].closest("tr")).toHaveClass(
      "ring-1",
      "ring-primary/20"
    );
  });

  it("shows out-of-range state when page is beyond the last real page", () => {
    // 1 group total, page_size=25 -> 1 page. Requesting page 5 is out of range.
    currentSearchParams = new URLSearchParams("page=5&page_size=25");
    setup({ data: { count: 1, results: [], next: null, previous: null } });
    render(<ResourceAccessPage />);

    expect(screen.getByText("Page out of range")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to page 1" })).toBeInTheDocument();
  });

  it("resets to page 1 when Back to page 1 is clicked", () => {
    currentSearchParams = new URLSearchParams("page=5&page_size=25");
    setup({ data: { count: 1, results: [], next: null, previous: null } });
    render(<ResourceAccessPage />);

    fireEvent.click(screen.getByRole("button", { name: "Back to page 1" }));

    expect(mockSetSearchParams).toHaveBeenCalled();
  });

  it("hero kicker uses text-foreground, not text-primary (browser probe: 3.31:1 dark FAIL)", () => {
    setup({});
    render(<ResourceAccessPage />);

    const kicker = screen.getByText("Least-privilege access");
    expect(kicker.className).toContain("text-foreground");
    expect(kicker.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });
});
