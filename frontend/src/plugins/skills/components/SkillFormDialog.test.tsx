import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillFormDialog } from "./SkillFormDialog";
import type { SkillCategory } from "../types/skills";

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

describe("SkillFormDialog", () => {
  it("submits the selected category", () => {
    const onSubmit = vi.fn();
    render(
      <SkillFormDialog
        open
        onClose={vi.fn()}
        editing={null}
        categories={categories}
        isSubmitting={false}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Django" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Category" }));
    fireEvent.click(screen.getByRole("option", { name: "Backend" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "DJANGO",
      category: 1,
      description: "",
      is_active: true,
    });
  });

  it("shows a server validation error", () => {
    render(
      <SkillFormDialog
        open
        onClose={vi.fn()}
        editing={null}
        categories={categories}
        isSubmitting={false}
        errorMessage="name: This skill already exists."
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText("name: This skill already exists.")).toBeInTheDocument();
  });

  it("requires a category before submission", () => {
    render(
      <SkillFormDialog
        open
        onClose={vi.fn()}
        editing={null}
        categories={categories}
        isSubmitting={false}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Django" } });

    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("includes is_active in the submit payload", () => {
    const onSubmit = vi.fn();
    render(
      <SkillFormDialog
        open
        onClose={vi.fn()}
        editing={null}
        categories={categories}
        isSubmitting={false}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Django" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Category" }));
    fireEvent.click(screen.getByRole("option", { name: "Backend" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ is_active: true }));
  });

  it("reflects is_active when editing an inactive skill", () => {
    const editing = {
      id: 1,
      category: 1,
      name: "Legacy Skill",
      code: "legacy",
      description: "",
      is_active: false,
      created_at: "",
      updated_at: "",
    };
    render(
      <SkillFormDialog
        open
        onClose={vi.fn()}
        editing={editing as any}
        categories={categories}
        isSubmitting={false}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole("switch", { name: "Skill active" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  it("sends is_active=false when the switch is toggled off", () => {
    const onSubmit = vi.fn();
    render(
      <SkillFormDialog
        open
        onClose={vi.fn()}
        editing={null}
        categories={categories}
        isSubmitting={false}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Django" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Category" }));
    fireEvent.click(screen.getByRole("option", { name: "Backend" }));
    fireEvent.click(screen.getByRole("switch", { name: "Skill active" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
  });

  it("pre-selects the default category when provided", () => {
    const onSubmit = vi.fn();
    render(
      <SkillFormDialog
        open
        onClose={vi.fn()}
        editing={null}
        categories={categories}
        defaultCategoryId={1}
        isSubmitting={false}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Django" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ category: 1 }));
  });
});
