import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TechMembersDialog } from "./TechMembersDialog";
import { userService } from "@/services/userService";
import type { Tech, TechMember, User } from "@/types";

vi.mock("@/services/userService", () => ({
  userService: {
    getTechMembers: vi.fn(),
    addTechMembers: vi.fn(),
    removeTechMembers: vi.fn(),
    getUsers: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const tech: Tech = {
  id: 1,
  name: "Infrastructure",
  code: "INFRA",
  is_active: true,
};

const members: TechMember[] = [
  { id: 10, username: "alice", email: "alice@example.com", full_name: "Alice Smith" },
  { id: 11, username: "bob", email: "bob@example.com", full_name: "Bob Jones" },
];

const candidateUsers: User[] = [
  {
    id: 12,
    username: "carol",
    email: "carol@example.com",
    first_name: "Carol",
    last_name: "White",
    is_staff: false,
    is_superuser: false,
  } as User,
  {
    id: 13,
    username: "dave",
    email: "dave@example.com",
    first_name: "Dave",
    last_name: "Brown",
    is_staff: false,
    is_superuser: false,
  } as User,
];

const renderWithProvider = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe("TechMembersDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userService.getTechMembers).mockResolvedValue({
      count: members.length,
      results: members,
    } as never);
    // getUsers now receives search param; default returns candidates
    vi.mocked(userService.getUsers).mockResolvedValue({
      count: candidateUsers.length,
      results: candidateUsers,
    } as never);
    vi.mocked(userService.addTechMembers).mockResolvedValue({ added: 1 } as never);
    vi.mocked(userService.removeTechMembers).mockResolvedValue({ removed: 1 } as never);
  });

  it("renders current members in the left panel", async () => {
    renderWithProvider(<TechMembersDialog tech={tech} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });
  });

  it("shows candidates (non-members) in the right panel", async () => {
    renderWithProvider(<TechMembersDialog tech={tech} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Carol White")).toBeInTheDocument();
      expect(screen.getByText("Dave Brown")).toBeInTheDocument();
    });
  });

  it("calls getUsers with search param when search is typed", async () => {
    renderWithProvider(<TechMembersDialog tech={tech} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Carol White")).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText("Search by name, username, email...");
    fireEvent.change(searchInput, { target: { value: "carol" } });

    // Wait for debounce (300ms) + query
    await waitFor(
      () => {
        expect(userService.getUsers).toHaveBeenCalledWith(
          expect.objectContaining({ search: "carol" })
        );
      },
      { timeout: 2000 }
    );
  });

  it("calls addTechMembers when add button clicked", async () => {
    renderWithProvider(<TechMembersDialog tech={tech} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Carol White")).toBeInTheDocument());

    const addButton = screen.getByLabelText("Add carol to Infrastructure");
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(userService.addTechMembers).toHaveBeenCalledWith(1, [12]);
    });
  });

  it("calls removeTechMembers when remove button clicked", async () => {
    renderWithProvider(<TechMembersDialog tech={tech} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    const removeButton = screen.getByLabelText("Remove alice from Infrastructure");
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(userService.removeTechMembers).toHaveBeenCalledWith(1, [10]);
    });
  });

  it("shows member count in left panel header", async () => {
    renderWithProvider(<TechMembersDialog tech={tech} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Members (2)")).toBeInTheDocument();
    });
  });

  it("shows loading state for candidates while fetching", async () => {
    vi.mocked(userService.getUsers).mockReturnValue(new Promise(() => {}) as never);
    renderWithProvider(<TechMembersDialog tech={tech} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Searching...")).toBeInTheDocument();
    });
  });
});
