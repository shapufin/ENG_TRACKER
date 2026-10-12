import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UserDetailPanel } from "./UserDetailPanel";
import type { UserProfile } from "@/types";

const profile = {
  id: 1,
  user: { id: 7, username: "alice", email: "alice@example.com", roles: ["albanian_tl"] },
  team: null,
  teams: [2],
  teams_detail: [{ id: 2, name: "DOME_TEAM", code: "DT", calendar_group: "" }],
  techs: [],
  techs_detail: [],
  albanian_tl: null,
  italian_tl: null,
  italian_tl_name: "Mario Rossi",
  is_hr_user: false,
  phone: "+355 69 000 0000",
  hire_date: "2024-03-01",
  groups: [],
  created_at: "",
  updated_at: "",
} as unknown as UserProfile;

describe("UserDetailPanel", () => {
  it("shows the row's facts without fetching anything", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <UserDetailPanel
        profile={profile}
        onOpenChange={vi.fn()}
        onEdit={vi.fn()}
        onReset={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText("DOME_TEAM")).toBeInTheDocument();
    expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getByText("albanian_tl")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("closes first, then runs Edit with the row", () => {
    const onOpenChange = vi.fn();
    const onEdit = vi.fn();
    render(
      <UserDetailPanel
        profile={profile}
        onOpenChange={onOpenChange}
        onEdit={onEdit}
        onReset={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit user alice" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onEdit).toHaveBeenCalledWith(profile);
  });

  it("resets the password by user id and deletes by row", () => {
    const onReset = vi.fn();
    const onDelete = vi.fn();
    render(
      <UserDetailPanel
        profile={profile}
        onOpenChange={vi.fn()}
        onEdit={vi.fn()}
        onReset={onReset}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset password for alice" }));
    expect(onReset).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByRole("button", { name: "Delete user alice" }));
    expect(onDelete).toHaveBeenCalledWith(profile);
  });

  it("renders nothing without a profile", () => {
    const { container } = render(
      <UserDetailPanel
        profile={null}
        onOpenChange={vi.fn()}
        onEdit={vi.fn()}
        onReset={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("groups facts into labelled sections", () => {
    render(
      <UserDetailPanel
        profile={profile}
        onOpenChange={vi.fn()}
        onEdit={vi.fn()}
        onReset={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { name: "Contact" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Teams & tech" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Leadership & roles" })).toBeInTheDocument();
  });

  it("edits the phone number inline and saves through onSaveField", () => {
    const onSaveField = vi.fn();
    render(
      <UserDetailPanel
        profile={profile}
        onOpenChange={vi.fn()}
        onEdit={vi.fn()}
        onReset={vi.fn()}
        onDelete={vi.fn()}
        onSaveField={onSaveField}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit phone for alice" }));
    const input = screen.getByLabelText("Phone");
    fireEvent.change(input, { target: { value: "+355 69 111 1111" } });
    fireEvent.click(screen.getByRole("button", { name: "Save phone" }));
    expect(onSaveField).toHaveBeenCalledWith(7, { phone: "+355 69 111 1111" });
  });

  it("edits the hire date inline and saves through onSaveField", () => {
    const onSaveField = vi.fn();
    render(
      <UserDetailPanel
        profile={profile}
        onOpenChange={vi.fn()}
        onEdit={vi.fn()}
        onReset={vi.fn()}
        onDelete={vi.fn()}
        onSaveField={onSaveField}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit hire date for alice" }));
    const input = screen.getByLabelText("Hire date");
    fireEvent.change(input, { target: { value: "2024-04-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Save hire date" }));
    expect(onSaveField).toHaveBeenCalledWith(7, { hire_date: "2024-04-02" });
  });

  it("cancels an inline edit without saving", () => {
    const onSaveField = vi.fn();
    render(
      <UserDetailPanel
        profile={profile}
        onOpenChange={vi.fn()}
        onEdit={vi.fn()}
        onReset={vi.fn()}
        onDelete={vi.fn()}
        onSaveField={onSaveField}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit phone for alice" }));
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel editing phone" }));
    expect(onSaveField).not.toHaveBeenCalled();
    expect(screen.getByText("+355 69 000 0000")).toBeInTheDocument();
  });
});
