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

// Selected user-type tabs share the failing tint pair (bg-primary/10 +
// text-primary ≈ 3.2:1 dark) — selected text must be text-foreground.
describe("UserCreateFormDialog user-type toggle contrast", () => {
  it("selected tab uses text-foreground, not text-primary", () => {
    renderDialog();
    const tab = screen.getByRole("button", { name: "Standard User" });
    expect(tab.className).toContain("text-foreground");
    expect(tab.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });
});
