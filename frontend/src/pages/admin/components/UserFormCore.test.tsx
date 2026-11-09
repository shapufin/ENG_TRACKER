import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserFormCore } from "./UserFormCore";

vi.mock("@/components/admin/TeamMultiSelect", () => ({
  TeamMultiSelect: () => <div data-testid="team-multi-select" />,
}));
vi.mock("@/components/admin/TechMultiSelect", () => ({
  TechMultiSelect: () => <div data-testid="tech-multi-select" />,
}));

const baseForm = {
  phone: "",
  teams: [],
  techs: [],
  albanian_tl: "none",
  italian_tl: "none",
  is_hr_user: false,
  is_italian_tl_role: false,
  is_albanian_tl_role: false,
  is_cr_admin: false,
  is_hbpr: false,
};

const renderCore = (form: Partial<typeof baseForm> = {}) =>
  render(
    <UserFormCore
      form={{ ...baseForm, ...form }}
      updateField={vi.fn()}
      prefix="edit"
      teamsData={[]}
      techsData={[]}
      albanianTLs={[]}
      italianTLs={[]}
    />
  );

describe("UserFormCore HBPR minimal mode", () => {
  it("shows all assignment fields and role switches when HBPR is unchecked", () => {
    renderCore();
    expect(screen.getByTestId("team-multi-select")).toBeInTheDocument();
    expect(screen.getByTestId("tech-multi-select")).toBeInTheDocument();
    expect(screen.getByText("Line Manager")).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();
    for (const name of [/HR/i, /^Manager/i, /^Line Manager/i, /CR Admin/i, /HBPR/i]) {
      expect(screen.getByRole("switch", { name })).toBeInTheDocument();
    }
  });

  it("hides assignment fields and TL/CR switches when HBPR is checked", () => {
    renderCore({ is_hbpr: true });
    expect(screen.queryByTestId("team-multi-select")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tech-multi-select")).not.toBeInTheDocument();
    expect(screen.queryByText("Line Manager")).not.toBeInTheDocument();
    expect(screen.queryByText("Manager")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /HR/i })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /HBPR/i })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /Manager/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /Line Manager/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /CR Admin/i })).not.toBeInTheDocument();
  });

  it("warns which hidden roles will be revoked on save", () => {
    renderCore({ is_hbpr: true, is_albanian_tl_role: true, is_cr_admin: true });
    expect(screen.getByText(/will revoke: Line Manager, CR Admin/)).toBeInTheDocument();
  });

  it("shows no warning when no hidden roles are held", () => {
    renderCore({ is_hbpr: true });
    expect(screen.queryByText(/will revoke/)).not.toBeInTheDocument();
  });
});

describe("UserFormCore employment type", () => {
  it("shows Full-time (40 h/week) checked and locked, in both modes", () => {
    const { unmount } = renderCore();
    const box = screen.getByRole("checkbox", { name: /full-time/i });
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
    expect(screen.getByText("Full-time (40 h/week)")).toBeInTheDocument();
    unmount();
    renderCore({ is_hbpr: true });
    expect(screen.getByRole("checkbox", { name: /full-time/i })).toBeDisabled();
  });
});
