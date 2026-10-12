import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImportOptionsPanel } from "./ImportOptionsPanel";
import type { ImportOption } from "../types/dataImport";

/**
 * The panel renders purely from the importer's option schema. No target key
 * is branched on here — adding a target must never require a frontend change.
 */
const optionSchema: ImportOption[] = [
  {
    key: "update_existing",
    label: "Update existing records",
    option_type: "bool",
    default: false,
    help_text: "Update matched records instead of skipping them.",
  },
  {
    key: "password_strategy",
    label: "Password strategy",
    option_type: "choice",
    default: "generate",
    choices: [
      ["generate", "Generate a random password per user"],
      ["fixed", "Use a fixed default password for all users"],
      ["column", "Use the mapped Password column"],
    ],
  },
  {
    key: "default_password",
    label: "Default password",
    option_type: "secret",
    default: "",
    depends_on: { password_strategy: "fixed" },
  },
  {
    key: "request_status",
    label: "Request status",
    option_type: "choice",
    default: "pending",
    choices: [
      ["pending", "Pending"],
      ["approved", "Approved"],
      ["rejected", "Rejected"],
      ["cancelled", "Cancelled"],
    ],
  },
  {
    key: "display_label",
    label: "Display label",
    option_type: "string",
    default: "",
  },
];

const baseProps = {
  optionSchema,
  detectedColumns: ["Username", "Email", "Password"],
  passwordColumn: null,
  onPasswordColumnChange: vi.fn(),
  options: { update_existing: false, password_strategy: "generate" },
  onChange: vi.fn(),
};

describe("ImportOptionsPanel", () => {
  it("renders every option in the schema", () => {
    render(<ImportOptionsPanel {...baseProps} />);
    expect(screen.getByLabelText("Update existing records")).toBeInTheDocument();
    expect(screen.getByText("Password strategy")).toBeInTheDocument();
    expect(screen.getByLabelText("Display label")).toBeInTheDocument();
  });

  it("renders nothing but the schema — an empty schema renders no options", () => {
    render(<ImportOptionsPanel {...baseProps} optionSchema={[]} />);
    expect(screen.queryByLabelText("Update existing records")).not.toBeInTheDocument();
  });

  it("hides an option whose depends_on is unmet", () => {
    render(<ImportOptionsPanel {...baseProps} />);
    expect(screen.queryByLabelText("Default password")).not.toBeInTheDocument();
  });

  it("shows an option once its depends_on is met", () => {
    render(
      <ImportOptionsPanel
        {...baseProps}
        options={{ update_existing: false, password_strategy: "fixed" }}
      />
    );
    expect(screen.getByLabelText("Default password")).toBeInTheDocument();
  });

  it("renders a secret option as a password field", () => {
    render(<ImportOptionsPanel {...baseProps} options={{ password_strategy: "fixed" }} />);
    expect(screen.getByLabelText("Default password")).toHaveAttribute("type", "password");
  });

  it("reports a toggle change under its option key", () => {
    const onChange = vi.fn();
    render(<ImportOptionsPanel {...baseProps} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Update existing records"));
    expect(onChange).toHaveBeenCalledWith("update_existing", true);
  });

  it("reports a text change under its option key", () => {
    const onChange = vi.fn();
    render(<ImportOptionsPanel {...baseProps} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Display label"), {
      target: { value: "Q1 load" },
    });
    expect(onChange).toHaveBeenCalledWith("display_label", "Q1 load");
  });

  it("falls back to the schema default when the value is unset", () => {
    render(<ImportOptionsPanel {...baseProps} options={{}} />);
    expect(screen.getByLabelText("Update existing records")).not.toBeChecked();
  });

  it("shows the password column selector only for the column strategy", () => {
    const { rerender } = render(<ImportOptionsPanel {...baseProps} />);
    expect(screen.queryByText("Password column")).not.toBeInTheDocument();

    rerender(<ImportOptionsPanel {...baseProps} options={{ password_strategy: "column" }} />);
    expect(screen.getByText("Password column")).toBeInTheDocument();
  });

  it("renders short choice lists as radio cards instead of a dropdown", () => {
    // AdminGUI comparison 2026-10-11: <=3 choices read better as selectable
    // cards (conflict-strategy style) than a collapsed dropdown.
    render(<ImportOptionsPanel {...baseProps} />);
    const group = screen.getByRole("group", { name: "Password strategy" });
    expect(group).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Generate a random password per user" })
    ).toBeChecked();
  });

  it("keeps a dropdown for choice lists longer than three", () => {
    render(<ImportOptionsPanel {...baseProps} />);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Request status" })).toBeInTheDocument();
  });

  it("reports a radio change under its option key", () => {
    const onChange = vi.fn();
    render(<ImportOptionsPanel {...baseProps} onChange={onChange} />);
    fireEvent.click(
      screen.getByRole("radio", { name: "Use a fixed default password for all users" })
    );
    expect(onChange).toHaveBeenCalledWith("password_strategy", "fixed");
  });
});
