import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockInvalidate = vi.fn();
const mockMutate = vi.fn();
const mockNavigate = vi.fn();
const mockSetSearchParams = vi.fn();

let currentSearchParams = new URLSearchParams();
let currentParams = { groupId: "1" };

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

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [currentSearchParams, mockSetSearchParams],
  useParams: () => currentParams,
}));

vi.mock("@/lib/error-handler", () => ({
  handleApiError: vi.fn(),
}));

// Mock the member dialog
vi.mock("./components/ResourceAccessMemberDialog", () => ({
  ResourceAccessMemberDialog: (props: any) => {
    if (!props.open) return null;
    return (
      <div data-testid="member-dialog">
        <button data-testid="member-add" onClick={() => props.onAdd(99)}>
          Add
        </button>
        <button data-testid="member-cancel" onClick={() => props.onOpenChange(false)}>
          Cancel
        </button>
        {props.errorMessage && <span data-testid="member-error">{props.errorMessage}</span>}
      </div>
    );
  },
}));

// Mock the group dialog
vi.mock("./components/ResourceAccessGroupDialog", () => ({
  ResourceAccessGroupDialog: (props: any) => {
    if (!props.open) return null;
    return (
      <div data-testid="edit-dialog">
        <button
          data-testid="edit-submit"
          onClick={() => props.onSubmit({ name: "Updated", code: "UPD", description: "desc" })}
        >
          Save
        </button>
        <button data-testid="edit-cancel" onClick={() => props.onOpenChange(false)}>
          Cancel
        </button>
        {props.errorMessage && <span data-testid="edit-error">{props.errorMessage}</span>}
      </div>
    );
  },
}));

// Mock ConfirmDialog
vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: (props: any) => {
    if (!props.open) return null;
    return (
      <div data-testid="confirm-dialog">
        <button data-testid="confirm-yes" onClick={props.onConfirm}>
          Confirm
        </button>
        <button data-testid="confirm-no" onClick={() => props.onOpenChange(false)}>
          Cancel
        </button>
      </div>
    );
  },
}));

import { useQuery, useMutation } from "@tanstack/react-query";
import { ResourceAccessGroupPage } from "./ResourceAccessGroupPage";

const groupData = {
  id: 1,
  name: "Analytics Viewers",
  code: "ANALYTICS",
  description: "Read-only analytics access",
  member_count: 2,
};

const member = {
  id: 10,
  user: 7,
  user_name: "alice",
  group: 1,
  group_name: "Analytics Viewers",
};

function setup({
  groupLoading = false,
  groupError = false,
  groupNull = false,
  membersLoading = false,
  membersError = false,
  emptyMembers = false,
}: {
  groupLoading?: boolean;
  groupError?: boolean;
  groupNull?: boolean;
  membersLoading?: boolean;
  membersError?: boolean;
  emptyMembers?: boolean;
} = {}) {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useQuery).mockImplementation((options: any) => {
    const key = options.queryKey;
    if (key[1] === "group") {
      if (groupLoading) return { data: undefined, isLoading: true, isError: false } as any;
      if (groupError) return { data: null, isLoading: false, isError: true } as any;
      if (groupNull) return { data: null, isLoading: false, isError: false } as any;
      return { data: groupData, isLoading: false, isError: false } as any;
    }
    if (key[1] === "members") {
      if (membersLoading)
        return {
          data: undefined,
          isLoading: true,
          isError: false,
          isFetching: false,
          refetch: vi.fn(),
        } as any;
      if (membersError)
        return {
          data: undefined,
          isLoading: false,
          isError: true,
          isFetching: false,
          refetch: vi.fn(),
        } as any;
      if (emptyMembers)
        return {
          data: { count: 0, results: [], next: null, previous: null },
          isLoading: false,
          isError: false,
          isFetching: false,
          refetch: vi.fn(),
        } as any;
      return {
        data: { count: 1, results: [member], next: null, previous: null },
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
      } as any;
    }
    if (key[1] === "user-search") {
      return {
        data: { count: 0, results: [], next: null, previous: null },
        isLoading: false,
      } as any;
    }
    return { data: undefined, isLoading: false, isError: false } as any;
  });
  vi.mocked(useMutation).mockReset();
  vi.mocked(useMutation).mockImplementation(
    () => ({ mutate: mockMutate, isPending: false, mutateAsync: vi.fn() }) as any
  );
}

describe("ResourceAccessGroupPage (detail)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearchParams = new URLSearchParams();
    currentParams = { groupId: "1" };
  });

  it("renders the group header with name, code, and member count", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    expect(screen.getAllByText("Analytics Viewers").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ANALYTICS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 members").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Read-only analytics access").length).toBeGreaterThan(0);
  });

  it("renders breadcrumb with link back to directory", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    expect(screen.getByText("Resource access")).toBeInTheDocument();
    expect(screen.getAllByText("Analytics Viewers").length).toBeGreaterThan(0);
  });

  it("navigates back to directory when breadcrumb is clicked", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    fireEvent.click(screen.getByText("Resource access"));

    expect(mockNavigate).toHaveBeenCalledWith("/admin/resource-access");
  });

  it("renders the Add member button", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    expect(screen.getByRole("button", { name: /Add member/ })).toBeInTheDocument();
  });

  it("renders Edit group button", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    expect(screen.getByRole("button", { name: /Edit group/ })).toBeInTheDocument();
  });

  it("renders member rows with username and remove button", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    expect(screen.getAllByText("alice").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Remove alice from Analytics Viewers" }).length
    ).toBeGreaterThan(0);
  });

  it("shows empty member state when no members exist", () => {
    setup({ emptyMembers: true });
    render(<ResourceAccessGroupPage />);

    expect(screen.getByText("No members yet")).toBeInTheDocument();
    expect(screen.getByText("Add first member")).toBeInTheDocument();
  });

  it("shows loading state while group is loading", () => {
    setup({ groupLoading: true });
    render(<ResourceAccessGroupPage />);

    expect(screen.getByText("Loading group")).toBeInTheDocument();
  });

  it("shows error state when group fails to load", () => {
    setup({ groupError: true });
    render(<ResourceAccessGroupPage />);

    expect(screen.getAllByText("Group not found").length).toBeGreaterThan(0);
  });

  it("shows error state when group is null (not found)", () => {
    setup({ groupNull: true });
    render(<ResourceAccessGroupPage />);

    expect(screen.getAllByText("Group not found").length).toBeGreaterThan(0);
  });

  it("shows member search input", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    expect(screen.getByRole("searchbox", { name: "Search members" })).toBeInTheDocument();
  });

  it("member search updates URL params", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    const searchInput = screen.getByRole("searchbox", { name: "Search members" });
    fireEvent.change(searchInput, { target: { value: "bob" } });

    expect(mockSetSearchParams).toHaveBeenCalled();
  });

  it("opens add member dialog when Add member is clicked", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    fireEvent.click(screen.getByRole("button", { name: /Add member/ }));

    expect(screen.getByTestId("member-dialog")).toBeInTheDocument();
  });

  it("calls mutate when add member dialog submits", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    fireEvent.click(screen.getByRole("button", { name: /Add member/ }));
    fireEvent.click(screen.getByTestId("member-add"));

    expect(mockMutate).toHaveBeenCalledWith(
      { user: 99, group: 1 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it("closes add member dialog when cancel is clicked", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    fireEvent.click(screen.getByRole("button", { name: /Add member/ }));
    expect(screen.getByTestId("member-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("member-cancel"));
    expect(screen.queryByTestId("member-dialog")).not.toBeInTheDocument();
  });

  it("opens edit dialog when Edit group is clicked", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    fireEvent.click(screen.getByRole("button", { name: /Edit group/ }));

    expect(screen.getByTestId("edit-dialog")).toBeInTheDocument();
  });

  it("calls mutate when edit dialog submits", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    fireEvent.click(screen.getByRole("button", { name: /Edit group/ }));
    fireEvent.click(screen.getByTestId("edit-submit"));

    expect(mockMutate).toHaveBeenCalledWith(
      { id: 1, payload: { name: "Updated", code: "UPD", description: "desc" } },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it("opens confirm dialog when remove is clicked", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    const removeBtns = screen.getAllByRole("button", {
      name: "Remove alice from Analytics Viewers",
    });
    fireEvent.click(removeBtns[0]);

    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("closes confirm dialog when cancel is clicked", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    const removeBtns = screen.getAllByRole("button", {
      name: "Remove alice from Analytics Viewers",
    });
    fireEvent.click(removeBtns[0]);
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("confirm-no"));
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("calls mutate when remove is confirmed", () => {
    setup();
    render(<ResourceAccessGroupPage />);

    const removeBtns = screen.getAllByRole("button", {
      name: "Remove alice from Analytics Viewers",
    });
    fireEvent.click(removeBtns[0]);
    fireEvent.click(screen.getByTestId("confirm-yes"));

    expect(mockMutate).toHaveBeenCalledWith(10, expect.any(Object));
  });

  it("shows clear search button when member search has text", () => {
    currentSearchParams = new URLSearchParams("member_search=bob");
    setup();
    render(<ResourceAccessGroupPage />);

    expect(screen.getByRole("button", { name: "Clear member search" })).toBeInTheDocument();
  });

  it("shows members loading state", () => {
    setup({ membersLoading: true });
    render(<ResourceAccessGroupPage />);

    expect(screen.getByText("Loading members")).toBeInTheDocument();
  });

  it("shows members error state with retry", () => {
    setup({ membersError: true });
    render(<ResourceAccessGroupPage />);

    expect(screen.getByText("Couldn't load members")).toBeInTheDocument();
  });

  it("shows not-found error state for invalid (NaN) groupId in URL", () => {
    currentParams = { groupId: "abc" };
    // When groupId is NaN, the query is disabled (enabled: groupId > 0 is false).
    // The query returns isLoading=false, data=undefined, isError=false.
    vi.mocked(useQuery).mockReset();
    vi.mocked(useQuery).mockImplementation((options: any) => {
      const key = options.queryKey;
      if (key[1] === "group") {
        // Disabled query: not loading, no data, no error.
        return { data: undefined, isLoading: false, isError: false } as any;
      }
      return { data: undefined, isLoading: false, isError: false } as any;
    });
    vi.mocked(useMutation).mockImplementation(
      () => ({ mutate: mockMutate, isPending: false, mutateAsync: vi.fn() }) as any
    );

    render(<ResourceAccessGroupPage />);

    // Should show the not-found error state, not the ready state.
    expect(screen.getAllByText("Group not found").length).toBeGreaterThan(0);
  });
});
