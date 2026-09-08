import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AddSkillDialog } from "./AddSkillDialog";
import type { Skill, SkillCategory } from "../types/skills";

const useSkillsMock = vi.fn();
const useSkillCategoriesMock = vi.fn();

vi.mock("../hooks/useSkillsQueries", () => ({
  useSkills: (...args: unknown[]) => useSkillsMock(...args),
  useSkillCategories: (...args: unknown[]) => useSkillCategoriesMock(...args),
}));

const categories: SkillCategory[] = [
  {
    id: 1,
    name: "Backend",
    code: "backend",
    description: "",
    is_active: true,
    created_at: "",
    updated_at: "",
  },
];

const skills: Skill[] = [
  {
    id: 10,
    category: 1,
    category_name: "Backend",
    name: "Python",
    code: "python",
    description: "",
    is_active: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: 11,
    category: 1,
    category_name: "Backend",
    name: "Django",
    code: "django",
    description: "",
    is_active: true,
    created_at: "",
    updated_at: "",
  },
];

const renderDialog = (props: Partial<Parameters<typeof AddSkillDialog>[0]> = {}) =>
  render(
    <MemoryRouter>
      <AddSkillDialog open onClose={vi.fn()} onAdd={vi.fn()} {...props} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  useSkillCategoriesMock.mockReturnValue({ data: categories });
  useSkillsMock.mockReturnValue({ data: skills });
});

describe("AddSkillDialog", () => {
  it("renders the dialog when open", () => {
    renderDialog();
    // "Add Skill" appears in both the title and the submit button.
    expect(screen.getAllByText("Add Skill").length).toBeGreaterThanOrEqual(1);
  });

  it("lists available skills", () => {
    renderDialog();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("Django")).toBeInTheDocument();
  });

  it("excludes existing skill ids from the list", () => {
    renderDialog({ existingSkillIds: [10] });
    expect(screen.queryByText("Python")).not.toBeInTheDocument();
    expect(screen.getByText("Django")).toBeInTheDocument();
  });

  it("shows an empty state when no skills are available", () => {
    useSkillsMock.mockReturnValue({ data: [] });
    renderDialog();
    expect(screen.getByText(/No skills available/i)).toBeInTheDocument();
  });

  it("calls onAdd with all selected skill ids and the shared level", async () => {
    const onAdd = vi.fn();
    renderDialog({ onAdd });
    fireEvent.click(screen.getByRole("button", { name: /Python/ }));
    fireEvent.click(screen.getByRole("button", { name: /Django/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 Skills" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith([10, 11], 3, undefined));
  });

  it("supports selecting and deselecting an individual skill", () => {
    renderDialog();
    const python = screen.getByRole("button", { name: /Python/ });
    fireEvent.click(python);
    expect(python).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(python);
    expect(python).toHaveAttribute("aria-pressed", "false");
  });

  it("disables submit until a skill is selected", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Add Skill" })).toBeDisabled();
  });

  it("uses mobile-sized selection targets and shows selected skill summary", () => {
    renderDialog();
    const skillButton = screen.getByRole("button", { name: /Python/ });
    expect(skillButton).toHaveClass("min-h-[44px]");
    fireEvent.click(skillButton);
    expect(screen.getByText(/Selected skill:/)).toHaveTextContent("Selected skill: Python");
  });

  it("disables submission while the parent mutation is pending", () => {
    renderDialog({ isSubmitting: true });
    expect(screen.getByRole("button", { name: "Adding..." })).toBeDisabled();
  });

  it("shows catalog loading and error states", () => {
    useSkillsMock.mockReturnValue({ data: [], isLoading: true });
    const { rerender } = renderDialog();
    expect(screen.getByRole("status")).toHaveTextContent("Loading skills...");

    useSkillsMock.mockReturnValue({ data: [], isLoading: false, error: new Error("failed") });
    rerender(
      <MemoryRouter>
        <AddSkillDialog open onClose={vi.fn()} onAdd={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load available skills.");
  });

  it("resets search, selection and level when reopened after a successful add", () => {
    const onAdd = vi.fn();
    const { rerender } = renderDialog({ onAdd });
    fireEvent.change(screen.getByLabelText("Search skills"), { target: { value: "py" } });
    fireEvent.click(screen.getByRole("button", { name: /Python/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add 1 Skills" }));

    rerender(
      <MemoryRouter>
        <AddSkillDialog open={false} onClose={vi.fn()} onAdd={onAdd} />
      </MemoryRouter>
    );
    rerender(
      <MemoryRouter>
        <AddSkillDialog open onClose={vi.fn()} onAdd={onAdd} />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("Search skills")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Add Skill" })).toBeDisabled();
  });
});
