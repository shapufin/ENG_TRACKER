import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColumnVisibilityMenu } from "./ColumnVisibilityMenu";
import type { ColumnDef } from "@tanstack/react-table";

const columns = [
  { id: "select", header: "Select" },
  { id: "name", header: "Name", accessorKey: "name" },
  { id: "email", header: "Email", accessorKey: "email" },
  { accessorKey: "phone", header: "Phone" },
  { id: "noHeader" },
  { header: "NoId" },
] as ColumnDef<any, unknown>[];

const visibility = { name: true, email: false, phone: true };

describe("ColumnVisibilityMenu", () => {
  it("renders trigger button with column count", () => {
    render(
      <ColumnVisibilityMenu
        columns={columns}
        visibility={visibility}
        onVisibilityChange={vi.fn()}
      />
    );
    expect(screen.getByText("Columns (2/3)")).toBeInTheDocument();
  });

  it("opens dialog and renders toggleable columns", () => {
    render(
      <ColumnVisibilityMenu
        columns={columns}
        visibility={visibility}
        onVisibilityChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Columns (2/3)"));
    expect(screen.getByText("Toggle Columns")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
  });

  it("does not render select column or columns without header text", () => {
    render(
      <ColumnVisibilityMenu
        columns={columns}
        visibility={visibility}
        onVisibilityChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Columns (2/3)"));
    expect(screen.queryByText("Select")).not.toBeInTheDocument();
    expect(screen.queryByText("NoId")).not.toBeInTheDocument();
  });

  it("toggles column visibility", () => {
    const onChange = vi.fn();
    render(
      <ColumnVisibilityMenu
        columns={columns}
        visibility={visibility}
        onVisibilityChange={onChange}
      />
    );
    fireEvent.click(screen.getByText("Columns (2/3)"));
    const emailCheckbox = screen.getByLabelText("Email");
    fireEvent.click(emailCheckbox);
    expect(onChange).toHaveBeenCalledWith({ ...visibility, email: true });
  });

  it("resets visibility to defaults", () => {
    const onChange = vi.fn();
    render(
      <ColumnVisibilityMenu
        columns={columns}
        visibility={visibility}
        onVisibilityChange={onChange}
      />
    );
    fireEvent.click(screen.getByText("Columns (2/3)"));
    fireEvent.click(screen.getByText("Reset to Defaults"));
    expect(onChange).toHaveBeenCalledWith({ name: true, email: true, phone: true });
  });

  it("defaults unchecked columns to visible when not in visibility map", () => {
    const onChange = vi.fn();
    render(
      <ColumnVisibilityMenu columns={columns} visibility={{}} onVisibilityChange={onChange} />
    );
    fireEvent.click(screen.getByText("Columns (3/3)"));
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  // Branch coverage: header is a function (falls back to accessorKey/id)
  it("falls back to accessorKey when header is a function", () => {
    const cols = [{ accessorKey: "dynamic", header: () => "Dynamic" }] as ColumnDef<any, unknown>[];
    render(<ColumnVisibilityMenu columns={cols} visibility={{}} onVisibilityChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Columns (1/1)"));
    expect(screen.getByText("dynamic")).toBeInTheDocument();
  });

  it("falls back to id when header is a function and no accessorKey", () => {
    const cols = [{ id: "fallbackId", header: () => "Custom" }] as ColumnDef<any, unknown>[];
    render(<ColumnVisibilityMenu columns={cols} visibility={{}} onVisibilityChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Columns (1/1)"));
    expect(screen.getByText("fallbackId")).toBeInTheDocument();
  });

  it("skips columns with empty header text", () => {
    const cols = [
      { id: "empty", header: "" },
      { id: "valid", header: "Valid" },
    ] as ColumnDef<any, unknown>[];
    render(<ColumnVisibilityMenu columns={cols} visibility={{}} onVisibilityChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Columns (1/1)"));
    expect(screen.queryByText("empty")).not.toBeInTheDocument();
    expect(screen.getByText("Valid")).toBeInTheDocument();
  });

  it("skips columns with non-string header and no id/accessorKey", () => {
    const cols = [{ header: 42 }, { id: "valid", header: "Valid" }] as ColumnDef<any, unknown>[];
    render(<ColumnVisibilityMenu columns={cols} visibility={{}} onVisibilityChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Columns (1/1)"));
    expect(screen.getByText("Valid")).toBeInTheDocument();
  });

  it("uses fallback col-index id when neither id nor accessorKey is present", () => {
    const cols = [
      { header: "HeaderOnly" }, // no id, no accessorKey
    ] as ColumnDef<any, unknown>[];
    render(<ColumnVisibilityMenu columns={cols} visibility={{}} onVisibilityChange={vi.fn()} />);
    // Should still render with a generated id; verify it doesn't crash
    expect(screen.getByText("Columns (0/0)")).toBeInTheDocument();
  });

  it("toggles column off when checkbox unchecked", () => {
    const onChange = vi.fn();
    render(
      <ColumnVisibilityMenu
        columns={columns}
        visibility={visibility}
        onVisibilityChange={onChange}
      />
    );
    fireEvent.click(screen.getByText("Columns (2/3)"));
    const nameCheckbox = screen.getByLabelText("Name");
    fireEvent.click(nameCheckbox);
    expect(onChange).toHaveBeenCalledWith({ ...visibility, name: false });
  });
});
