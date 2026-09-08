import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HolidayFormDialog } from "./HolidayFormDialog";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    editingName: null,
    form: {
      name: "",
      date: "",
      country_code: "",
      is_global: false,
      description: "",
      calendar: "",
    },
    onFormChange: vi.fn(),
    workspaceOptions: [{ id: 1, name: "E2E Cal" }],
    isSubmitting: false,
    onSubmit: vi.fn(),
    ...overrides,
  };
}

describe("HolidayFormDialog", () => {
  it("renders the global toggle as an accessible switch with an unchanged boolean payload", () => {
    const onFormChange = vi.fn();
    render(<HolidayFormDialog {...makeProps({ onFormChange })} />);

    const toggle = screen.getByRole("switch", { name: /Applies to all workspaces/i });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    expect(onFormChange).toHaveBeenCalledWith(expect.objectContaining({ is_global: true }));
  });
});
