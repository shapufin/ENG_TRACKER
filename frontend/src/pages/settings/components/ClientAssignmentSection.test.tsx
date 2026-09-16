import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClientAssignmentSection } from "./ClientAssignmentSection";
import * as useClientAssignment from "../hooks/useClientAssignment";

vi.mock("../hooks/useClientAssignment", () => ({ useClientAssignment: vi.fn() }));

const clients = [
  { id: 1, name: "SIAE", code: "SIAE" },
  { id: 2, name: "MSC", code: "MSC" },
];

const members = [
  { id: 1, user: { id: 1, username: "alice", first_name: "Alice", last_name: "A" } },
  { id: 2, user: { id: 2, username: "bob", first_name: "", last_name: "" } },
  { id: 3, user: { id: 3, username: "cara", first_name: "Cara", last_name: "C" } },
] as any;

const baseHook = {
  members,
  clients: clients as any,
  effective: { 1: [], 2: [1], 3: [1, 2] },
  setDraft: vi.fn(),
  saveAll: vi.fn(),
  isSaving: false,
  isDirty: false,
  isLoading: false,
};

beforeEach(() => {
  vi.mocked(useClientAssignment.useClientAssignment).mockReturnValue({ ...baseHook } as any);
});

describe("ClientAssignmentSection", () => {
  it("renders one named client picker per team member", () => {
    render(<ClientAssignmentSection />);
    expect(screen.getByText("Client Assignment")).toBeInTheDocument();
    expect(
      screen.getByText("Assign team members to business clients for accurate payroll export.")
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Client for Alice A" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Client for bob" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Client for Cara C" })).toBeInTheDocument();
  });

  it("shows every assigned client for a member with several clients", () => {
    render(<ClientAssignmentSection />);
    expect(screen.getByRole("combobox", { name: "Client for Cara C" })).toHaveTextContent(
      "2 clients"
    );
  });

  it("lets a TL select multiple clients for one member", () => {
    render(<ClientAssignmentSection />);
    fireEvent.click(screen.getByRole("combobox", { name: "Client for bob" }));
    fireEvent.click(screen.getByRole("option", { name: /MSC/ }));
    expect(baseHook.setDraft).toHaveBeenCalledWith(2, [1, 2]);
  });

  it("disables Save Changes when pristine and enables it when dirty", () => {
    const { rerender } = render(<ClientAssignmentSection />);
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
    vi.mocked(useClientAssignment.useClientAssignment).mockReturnValue({
      ...baseHook,
      isDirty: true,
    } as any);
    rerender(<ClientAssignmentSection />);
    expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
  });

  it("uses a solid save button (no mockup gradient)", () => {
    const { container } = render(<ClientAssignmentSection />);
    expect(container.querySelector(".from-purple-600")).toBeNull();
  });

  it("shows an empty state with no CTA when the team list is empty", () => {
    vi.mocked(useClientAssignment.useClientAssignment).mockReturnValue({
      ...baseHook,
      members: [],
      effective: {},
    } as any);
    render(<ClientAssignmentSection />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
