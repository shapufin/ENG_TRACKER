import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserCreateFormDialog } from "./UserCreateFormDialog";

vi.mock("@/plugins/control_room/hooks/useControlRoomAccess", () => ({
  useCreateCRUser: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Radix dialogs need ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const form = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  password: "",
  phone: "",
  teams: [],
  techs: [],
  albanian_tl: "",
  italian_tl: "",
  is_hr_user: false,
  is_italian_tl_role: false,
  is_albanian_tl_role: false,
  is_cr_admin: false,
  roles: [],
};

const renderDialog = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <UserCreateFormDialog
        open
        onOpenChange={vi.fn()}
        form={form}
        formErrors={{}}
        teamsData={[]}
        techsData={[]}
        albanianTLs={[]}
        italianTLs={[]}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onFormChange={vi.fn()}
        onFormErrorsChange={vi.fn()}
      />
    </QueryClientProvider>
  );
};

// The user-type toggle is an OptionPills radiogroup. Selection must be exposed
// to assistive tech via aria-checked, and the selected tint must not be the
// failing bg-primary/10 + text-primary pair (≈ 3.2:1 in dark).
describe("UserCreateFormDialog user-type toggle", () => {
  it("exposes the selection as a radiogroup", () => {
    renderDialog();
    expect(screen.getByRole("radiogroup", { name: "Account type" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Standard User" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("radio", { name: "CR User" })).toHaveAttribute("aria-checked", "false");
  });

  it("selected pill uses a tone token, not text-primary", () => {
    renderDialog();
    const tab = screen.getByRole("radio", { name: "Standard User" });
    expect(tab.className).toContain("text-tone-accent-text");
    expect(tab.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });
});
