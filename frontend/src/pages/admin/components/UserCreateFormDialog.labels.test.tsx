import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserCreateFormDialog } from "./UserCreateFormDialog";

vi.mock("@/plugins/control_room/hooks/useControlRoomAccess", () => ({
  useCreateCRUser: () => ({ mutate: vi.fn(), isPending: false }),
}));

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

// Mechanical pass: first/last name labels are wired; CR scope group is labelled.
describe("UserCreateFormDialog labels", () => {
  it("first and last name labels resolve to their inputs", () => {
    renderDialog();
    expect(screen.getByLabelText("First Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Last Name")).toBeInTheDocument();
  });
});
