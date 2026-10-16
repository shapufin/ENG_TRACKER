import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserCreateFormDialog } from "./UserCreateFormDialog";

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
  albanian_tl: "none",
  italian_tl: "none",
  is_hr_user: false,
  is_italian_tl_role: false,
  is_albanian_tl_role: false,
  is_cr_admin: false,
  is_hbpr: false,
  roles: [],
};

const renderDialog = (over: Record<string, unknown> = {}) => {
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
        {...over}
      />
    </QueryClientProvider>
  );
};

describe("UserCreateFormDialog flow", () => {
  it("offers a generated password", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Generate password" })).toBeInTheDocument();
  });

  it("starts with only the account fields; assignment and roles are opt-in", () => {
    renderDialog();
    const toggle = screen.getByRole("button", { name: /Assignment & roles/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Teams")).toBeNull();
    expect(screen.queryByText("HBPR")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Teams")).toBeInTheDocument();
    expect(screen.getByText("HBPR")).toBeInTheDocument();
  });

  it("shows server field errors inline on username, email and password", () => {
    renderDialog({
      formErrors: {
        username: "Username already exists.",
        email: "Invalid email address.",
        password: "Too common.",
      },
    });
    expect(screen.getByText("Username already exists.")).toBeInTheDocument();
    expect(screen.getByText("Invalid email address.")).toBeInTheDocument();
    expect(screen.getByText("Too common.")).toBeInTheDocument();
  });

  it("opens the assignment section when a hidden field has an error", () => {
    renderDialog({ formErrors: { teams: "Invalid team." } });
    expect(screen.getByRole("button", { name: /Assignment & roles/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });
});
