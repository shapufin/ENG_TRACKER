import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColumnMappingForm } from "./ColumnMappingForm";
import type { ImportField } from "../types/dataImport";

const fields: ImportField[] = [
  { key: "username", label: "Username", required: true, field_type: "string" },
  { key: "email", label: "Email", required: true, field_type: "email" },
  { key: "password", label: "Password", required: false, field_type: "string" },
  { key: "is_hr", label: "Is HR", required: false, field_type: "bool" },
];

const detectedColumns = ["Username", "Email", "Password", "HR"];

describe("ColumnMappingForm", () => {
  it("renders all fields and the skip option", () => {
    render(
      <ColumnMappingForm
        fields={fields}
        detectedColumns={detectedColumns}
        fieldMapping={{}}
        defaultValues={{}}
        onFieldMappingChange={vi.fn()}
        onDefaultValueChange={vi.fn()}
      />
    );
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Is HR")).toBeInTheDocument();
  });

  it("does not render the password field row (controlled via ImportOptionsPanel)", () => {
    render(
      <ColumnMappingForm
        fields={fields}
        detectedColumns={detectedColumns}
        fieldMapping={{}}
        defaultValues={{}}
        onFieldMappingChange={vi.fn()}
        onDefaultValueChange={vi.fn()}
      />
    );
    // Password label should not appear in the mapping form; it is handled by options.
    expect(screen.queryByText("Password")).not.toBeInTheDocument();
  });

  it("calls onFieldMappingChange when a column is selected", () => {
    const onFieldMappingChange = vi.fn();
    render(
      <ColumnMappingForm
        fields={fields}
        detectedColumns={detectedColumns}
        fieldMapping={{}}
        defaultValues={{}}
        onFieldMappingChange={onFieldMappingChange}
        onDefaultValueChange={vi.fn()}
      />
    );

    const trigger = screen.getAllByRole("combobox")[0];
    fireEvent.click(trigger);
    // The dropdown is rendered in a portal; click the last "Username" occurrence
    // which belongs to the opened select list.
    const options = screen.getAllByText("Username");
    fireEvent.click(options[options.length - 1]);

    expect(onFieldMappingChange).toHaveBeenCalledWith("username", "Username");
  });

  it("shows required-field error when unmapped and no default", () => {
    render(
      <ColumnMappingForm
        fields={fields}
        detectedColumns={detectedColumns}
        fieldMapping={{}}
        defaultValues={{}}
        onFieldMappingChange={vi.fn()}
        onDefaultValueChange={vi.fn()}
      />
    );
    expect(screen.getByText(/Missing required fields/i)).toBeInTheDocument();
  });

  it("clears required-field error when a default value is supplied", () => {
    render(
      <ColumnMappingForm
        fields={fields}
        detectedColumns={detectedColumns}
        fieldMapping={{}}
        defaultValues={{ username: "default_user", email: "default@example.com" }}
        onFieldMappingChange={vi.fn()}
        onDefaultValueChange={vi.fn()}
      />
    );
    expect(screen.queryByText(/Missing required fields/i)).not.toBeInTheDocument();
  });

  it("renders bool default selector for bool fields", () => {
    const onDefaultValueChange = vi.fn();
    render(
      <ColumnMappingForm
        fields={fields}
        detectedColumns={detectedColumns}
        fieldMapping={{}}
        defaultValues={{}}
        onFieldMappingChange={vi.fn()}
        onDefaultValueChange={onDefaultValueChange}
      />
    );

    const triggers = screen.getAllByRole("combobox");
    // bool default selector is the last dropdown rendered
    fireEvent.click(triggers[triggers.length - 1]);
    fireEvent.click(screen.getByText("True"));

    expect(onDefaultValueChange).toHaveBeenCalledWith("is_hr", true);
  });
});
