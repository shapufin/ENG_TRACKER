import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillCategoryDialog } from "./SkillCategoryDialog";
import type { SkillCategory } from "../types/skills";

const renderDialog = (onSubmit = vi.fn()) => {
  render(
    <SkillCategoryDialog
      open
      onClose={vi.fn()}
      editing={null}
      isSubmitting={false}
      onSubmit={onSubmit}
    />
  );
  return onSubmit;
};

describe("SkillCategoryDialog", () => {
  it("submits the category form payload with is_active defaulting to true", () => {
    const onSubmit = renderDialog();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Frontend" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Frontend skills" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "FRONTEND",
      description: "Frontend skills",
      is_active: true,
    });
  });

  it("shows a server validation error", () => {
    render(
      <SkillCategoryDialog
        open
        onClose={vi.fn()}
        editing={null}
        isSubmitting={false}
        errorMessage="code: This code is already in use."
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText("code: This code is already in use.")).toBeInTheDocument();
  });

  it("disables submission while saving", () => {
    render(
      <SkillCategoryDialog open onClose={vi.fn()} editing={null} isSubmitting onSubmit={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  });

  it("reflects is_active=false when editing an inactive category", () => {
    const editing: SkillCategory = {
      id: 1,
      name: "Legacy",
      code: "legacy",
      description: "",
      is_active: false,
      created_at: "",
      updated_at: "",
    };
    render(
      <SkillCategoryDialog
        open
        onClose={vi.fn()}
        editing={editing}
        isSubmitting={false}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole("switch", { name: "Category active" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  it("sends is_active=false when the switch is toggled off", () => {
    const onSubmit = vi.fn();
    render(
      <SkillCategoryDialog
        open
        onClose={vi.fn()}
        editing={null}
        isSubmitting={false}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Legacy" } });
    fireEvent.click(screen.getByRole("switch", { name: "Category active" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
  });
});
