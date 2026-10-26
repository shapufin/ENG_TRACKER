import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OvertimeFormDialog } from "./OvertimeFormDialog";

vi.mock("@/components/ui/FormDialog", () => ({
  FormDialog: ({ children, title, onSubmit }: any) => (
    <form onSubmit={onSubmit} data-testid="dialog">
      <h2>{title}</h2>
      {children}
    </form>
  ),
}));
vi.mock("@/components/ui/DatePicker", () => ({
  DatePicker: ({ value }: any) => <input value={value} data-testid="date" readOnly />,
}));
vi.mock("@/components/ui/TimeHoursGrid", () => ({
  TimeHoursGrid: () => <div data-testid="time-grid" />,
}));
vi.mock("@/components/common/forms/UserSelectField", () => ({
  UserSelectField: () => <div data-testid="user-select" />,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value }: any) => (
    <div data-testid="client-select" data-value={value}>
      {children}
    </div>
  ),
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: [] }),
}));
vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: () => ({ canManage: () => false }),
}));
vi.mock("@/plugins", () => ({ getPluginComponent: () => null }));

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  editing: false,
  isAdmin: false,
  form: {
    user: "",
    client: "",
    date: "",
    start_time: "",
    end_time: "",
    hours: "",
    description: "",
    evidence_type: "other" as const,
    evidence: "",
    ticket_references: [],
  },
  formErrors: {},
  clients: [{ id: 3, name: "Active Co" }],
  previewHours: null,
  isSubmitting: false,
  onSubmit: vi.fn(),
  onFormChange: vi.fn(),
  onFormErrorsChange: vi.fn(),
};

describe("OvertimeFormDialog", () => {
  it("offers only the picker list when creating", () => {
    render(<OvertimeFormDialog {...baseProps} />);
    expect(screen.getByText("Active Co")).toBeInTheDocument();
    expect(screen.queryByText("Retired Co")).not.toBeInTheDocument();
  });

  it("keeps the record's own archived client, and keeps it selected, when editing", () => {
    render(
      <OvertimeFormDialog
        {...baseProps}
        editing={true}
        editingLog={
          {
            id: 4,
            client: 9,
            client_name: "Retired Co",
          } as any
        }
        form={{ ...baseProps.form, client: "9" }}
      />
    );
    // Archived clients are not in the picker list any more; the record's own
    // client must still render, or the field would look empty and the record
    // could not be saved unchanged (G8).
    expect(screen.getByText("Retired Co")).toBeInTheDocument();
    // Client is the first Select on the form (evidence type is the second).
    expect(screen.getAllByTestId("client-select")[0]).toHaveAttribute("data-value", "9");
  });

  it("does not duplicate a client that is both in the picker and on the record", () => {
    render(
      <OvertimeFormDialog
        {...baseProps}
        editing={true}
        editingLog={{ id: 4, client: 3, client_name: "Active Co" } as any}
        form={{ ...baseProps.form, client: "3" }}
      />
    );
    expect(screen.getAllByText("Active Co")).toHaveLength(1);
  });
});
