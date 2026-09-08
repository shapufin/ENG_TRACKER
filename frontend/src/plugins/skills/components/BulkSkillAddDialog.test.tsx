import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BulkSkillAddDialog } from "./BulkSkillAddDialog";
import type { Skill, SkillCategory } from "../types/skills";

const category: SkillCategory = {
  id: 1,
  name: "Infrastructure",
  code: "infra",
  description: "",
  is_active: true,
  created_at: "",
  updated_at: "",
};
const existing: Skill[] = [
  {
    id: 1,
    category: 1,
    category_name: "Infrastructure",
    name: "Linux",
    code: "linux",
    description: "",
    is_active: true,
    created_at: "",
    updated_at: "",
  },
];
const renderDialog = (onSubmit = vi.fn()) =>
  render(
    <BulkSkillAddDialog
      open
      category={category}
      existingSkills={existing}
      isSubmitting={false}
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />
  );

describe("BulkSkillAddDialog", () => {
  it("starts with one editable row and can add another", () => {
    renderDialog();
    expect(screen.getByLabelText("Skill name 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    expect(screen.getByLabelText("Skill name 2")).toBeInTheDocument();
  });

  it("rejects duplicate names or codes before submitting", () => {
    const onSubmit = vi.fn();
    renderDialog(onSubmit);
    fireEvent.change(screen.getByLabelText("Skill name 1"), { target: { value: "Linux" } });
    fireEvent.click(screen.getByRole("button", { name: "Add 1 skill" }));
    expect(screen.getByRole("alert")).toHaveTextContent("already exists");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits trimmed rows with the selected category", () => {
    const onSubmit = vi.fn();
    renderDialog(onSubmit);
    fireEvent.change(screen.getByLabelText("Skill name 1"), { target: { value: "  Docker " } });
    fireEvent.click(screen.getByRole("button", { name: "Add 1 skill" }));
    expect(onSubmit).toHaveBeenCalledWith([{ name: "DOCKER", category: 1 }]);
  });

  it("keeps failed rows with messages and drops successful ones after partial failure", async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ failedRows: [{ index: 0, name: "Nginx", message: "duplicate code" }] });
    renderDialog(onSubmit);
    fireEvent.change(screen.getByLabelText("Skill name 1"), { target: { value: "Nginx" } });
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    fireEvent.change(screen.getByLabelText("Skill name 2"), { target: { value: "Docker" } });
    fireEvent.click(screen.getByRole("button", { name: "Add 2 skills" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.queryByDisplayValue("Docker")).not.toBeInTheDocument();
      expect(screen.getByDisplayValue("Nginx")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Nginx: duplicate code");
    });
  });

  it("preserves stable input ids when a middle row is removed", () => {
    // key={index} causes the id/htmlFor attributes (derived from index) to
    // shift when a middle row is deleted, breaking label-input associations.
    // With a stable per-row id, the remaining rows keep their original ids.
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    // 3 rows: type AAA, BBB, CCC
    fireEvent.change(screen.getByLabelText("Skill name 1"), { target: { value: "AAA" } });
    fireEvent.change(screen.getByLabelText("Skill name 2"), { target: { value: "BBB" } });
    fireEvent.change(screen.getByLabelText("Skill name 3"), { target: { value: "CCC" } });
    const cccInput = screen.getByDisplayValue("CCC") as HTMLInputElement;
    const cccIdBefore = cccInput.id;
    // Remove the middle row (BBB) — aria-label is "Remove row 2"
    fireEvent.click(screen.getByRole("button", { name: "Remove row 2" }));
    // CCC should still be present with the SAME id (not shifted)
    const cccInputAfter = screen.getByDisplayValue("CCC") as HTMLInputElement;
    expect(cccInputAfter.id).toBe(cccIdBefore);
    // And the label should still point to it
    expect(document.querySelector(`label[for="${cccInputAfter.id}"]`)).not.toBeNull();
  });
});
