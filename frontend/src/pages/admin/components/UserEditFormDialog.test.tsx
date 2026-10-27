import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserEditFormDialog } from "./UserEditFormDialog";

vi.mock("./UserFormCore", () => ({ UserFormCore: () => <div>core</div> }));

const baseForm = {
  first_name: "A",
  last_name: "B",
  email: "a@b.c",
  phone: "",
  teams: [2],
  techs: [],
  albanian_tl: "none",
  italian_tl: "9",
  is_hr_user: false,
  is_italian_tl_role: false,
  is_albanian_tl_role: false,
  hire_date: "",
};

const renderDialog = (form = baseForm, onFormChange = vi.fn()) =>
  render(
    <UserEditFormDialog
      open
      onOpenChange={vi.fn()}
      editing={{ id: 1, user: { username: "alice" }, teams: [1, 2] } as never}
      form={form}
      formErrors={{}}
      teamsData={[
        { id: 1, name: "Alpha" },
        { id: 2, name: "Beta" },
      ]}
      techsData={[]}
      albanianTLs={[]}
      italianTLs={[]}
      isSubmitting={false}
      onSubmit={vi.fn()}
      onFormChange={onFormChange}
      onFormErrorsChange={vi.fn()}
    />
  );

describe("UserEditFormDialog team removal", () => {
  it("offers to clear the TL link when a team with a TL link is removed", () => {
    const onFormChange = vi.fn();
    renderDialog(baseForm, onFormChange);
    const box = screen.getByLabelText(/also clear the italian\/albanian tl link/i);
    expect(screen.getByText(/\(Alpha\)/)).toBeInTheDocument();
    fireEvent.click(box);
    expect(onFormChange).toHaveBeenCalled();
  });

  it("stays quiet when nothing was removed or the user has no TL link", () => {
    renderDialog({ ...baseForm, teams: [1, 2] });
    expect(screen.queryByLabelText(/also clear the italian\/albanian tl link/i)).toBeNull();
    renderDialog({ ...baseForm, italian_tl: "none" });
    expect(screen.queryByLabelText(/also clear the italian\/albanian tl link/i)).toBeNull();
  });
});
