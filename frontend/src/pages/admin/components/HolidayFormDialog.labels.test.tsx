import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HolidayFormDialog } from "./HolidayFormDialog";

// Radix Select needs ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const form = {
  name: "",
  date: "",
  country_code: "",
  is_global: true,
  description: "",
  calendar: "global",
};

const renderDialog = () =>
  render(
    <HolidayFormDialog
      open
      onOpenChange={vi.fn()}
      form={form}
      onFormChange={vi.fn()}
      workspaceOptions={[]}
      isSubmitting={false}
      onSubmit={(e) => e.preventDefault()}
    />
  );

// Mechanical pass: every label is associated with its control.
describe("HolidayFormDialog labels", () => {
  it("labels resolve to their inputs", () => {
    renderDialog();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.getByLabelText("Country Code")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
  });
});
