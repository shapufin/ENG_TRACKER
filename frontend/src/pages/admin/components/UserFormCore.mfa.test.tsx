import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { UserFormCore } from "./UserFormCore";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);
vi.mock("@/components/admin/TeamMultiSelect", () => ({ TeamMultiSelect: () => <div /> }));
vi.mock("@/components/admin/TechMultiSelect", () => ({ TechMultiSelect: () => <div /> }));

const form = {
  phone: "",
  teams: [],
  techs: [],
  albanian_tl: "none",
  italian_tl: "none",
  is_hr_user: false,
  is_italian_tl_role: false,
  is_albanian_tl_role: false,
  mfa_required: false,
};

const renderCore = (props: Record<string, unknown>, updateField = vi.fn()) => {
  render(
    <UserFormCore
      form={form}
      updateField={updateField}
      prefix="e"
      teamsData={[]}
      techsData={[]}
      albanianTLs={[]}
      italianTLs={[]}
      {...props}
    />
  );
  return updateField;
};

describe("UserFormCore two-factor requirement", () => {
  it("offers the per-person switch on edit and reports changes", () => {
    const updateField = renderCore({ showMfa: true });
    const toggle = screen.getByRole("switch", { name: /require two-factor authentication/i });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(updateField).toHaveBeenCalledWith("mfa_required", true);
  });

  it("is absent on create, which cannot set it", () => {
    renderCore({});
    expect(screen.queryByText(/require two-factor authentication/i)).not.toBeInTheDocument();
  });
});
