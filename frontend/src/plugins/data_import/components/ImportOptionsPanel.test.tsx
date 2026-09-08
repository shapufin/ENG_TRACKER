import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImportOptionsPanel } from "./ImportOptionsPanel";
import type { PasswordStrategy } from "../types/dataImport";

const baseProps = {
  targetKey: "users",
  detectedColumns: ["Username", "Email", "Password"],
  passwordColumn: null,
  onPasswordColumnChange: vi.fn(),
  options: {
    update_existing: false,
    match_by_email: false,
    password_strategy: "generate" as PasswordStrategy,
    default_password: "",
    overwrite_existing_password: false,
  },
  onChange: vi.fn(),
};

describe("ImportOptionsPanel", () => {
  it("renders user-specific options for users target", () => {
    render(<ImportOptionsPanel {...baseProps} />);
    expect(screen.getByText("Password Strategy")).toBeInTheDocument();
    expect(screen.getByText("Update existing records")).toBeInTheDocument();
    expect(screen.getByText("Match by email if username not found")).toBeInTheDocument();
  });

  it("does not render user-specific options for non-users targets", () => {
    render(<ImportOptionsPanel {...baseProps} targetKey="leave_balances" />);
    expect(screen.queryByText("Password Strategy")).not.toBeInTheDocument();
    expect(screen.queryByText("Update existing records")).toBeInTheDocument();
  });

  it("shows default password input when strategy is fixed", () => {
    render(
      <ImportOptionsPanel
        {...baseProps}
        options={{ ...baseProps.options, password_strategy: "fixed" }}
      />
    );
    expect(screen.getByLabelText("Default Password")).toBeInTheDocument();
  });

  it("shows password column selector when strategy is column", () => {
    render(
      <ImportOptionsPanel
        {...baseProps}
        options={{ ...baseProps.options, password_strategy: "column" }}
      />
    );
    expect(screen.getByLabelText("Password Column")).toBeInTheDocument();
  });

  it("calls onPasswordColumnChange when a column is selected", () => {
    const onPasswordColumnChange = vi.fn();
    render(
      <ImportOptionsPanel
        {...baseProps}
        options={{ ...baseProps.options, password_strategy: "column" }}
        onPasswordColumnChange={onPasswordColumnChange}
      />
    );

    const trigger = screen.getByLabelText("Password Column");
    fireEvent.click(trigger);
    // Dropdown is rendered in a portal; click the last "Password" occurrence.
    const options = screen.getAllByText("Password");
    fireEvent.click(options[options.length - 1]);

    expect(onPasswordColumnChange).toHaveBeenCalledWith("Password");
  });
});
