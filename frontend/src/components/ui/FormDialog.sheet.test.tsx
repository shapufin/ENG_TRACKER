import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormDialog } from "./FormDialog";

const renderForm = (props: Partial<React.ComponentProps<typeof FormDialog>> = {}) =>
  render(
    <FormDialog open onOpenChange={vi.fn()} title="New entry" onSubmit={vi.fn()} {...props}>
      <p>Fields</p>
    </FormDialog>
  );

describe("FormDialog phone sheet", () => {
  it("stays a centred modal unless a page opts in", () => {
    renderForm();

    expect(screen.getByRole("dialog").className).not.toContain("max-md:bottom-0");
  });

  it("becomes a bottom sheet on phones when mobileSheet is set", () => {
    renderForm({ mobileSheet: true });

    expect(screen.getByRole("dialog").className).toContain("max-md:bottom-0");
  });
});
