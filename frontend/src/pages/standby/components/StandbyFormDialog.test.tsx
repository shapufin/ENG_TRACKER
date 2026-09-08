import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StandbyFormDialog } from "./StandbyFormDialog";

vi.mock("@/components/ui/FormDialog", () => ({
  FormDialog: ({ children, title, onSubmit }: any) => (
    <form onSubmit={onSubmit} data-testid="dialog">
      <h2>{title}</h2>
      {children}
    </form>
  ),
}));
vi.mock("@/components/ui/DatePicker", () => ({
  DatePicker: ({ value, onChange }: any) => (
    <input value={value} onChange={(e) => onChange(e.target.value)} data-testid="date" />
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select">
      {value}
      <button onClick={() => onValueChange("2")}>change</button>
      {children}
    </div>
  ),
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange }: any) => (
    <input type="checkbox" checked={checked} onChange={() => onCheckedChange()} data-testid="checkbox" />
  ),
}));

describe("StandbyFormDialog", () => {
  const baseProps = {
    open: true,
    onOpenChange: vi.fn(),
    editing: false,
    isAdmin: true,
    form: { user: "", date: "", start_time: "", end_time: "", hours: "", description: "", client_ids: [] },
    formErrors: {},
    users: [
      { id: 1, full_name: "Alice" },
      { id: 2, full_name: "Bob" },
    ],
    previewHours: null,
    isSubmitting: false,
    onSubmit: vi.fn(),
    onFormChange: vi.fn(),
    onFormErrorsChange: vi.fn(),
  };

  it("renders create form with user select", () => {
    render(<StandbyFormDialog {...baseProps} />);
    expect(screen.getByText("New Standby")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("updates field and clears error", () => {
    render(<StandbyFormDialog {...baseProps} formErrors={{ date: "invalid" }} />);
    fireEvent.change(screen.getByTestId("date"), { target: { value: "01/01/2024" } });
    expect(baseProps.onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ date: "01/01/2024" })
    );
    expect(baseProps.onFormErrorsChange).toHaveBeenCalledWith({});
  });

  it("renders edit form without user select", () => {
    render(<StandbyFormDialog {...baseProps} editing={true} />);
    expect(screen.getByText("Edit Standby")).toBeInTheDocument();
    expect(screen.queryByText("User")).not.toBeInTheDocument();
  });
});
