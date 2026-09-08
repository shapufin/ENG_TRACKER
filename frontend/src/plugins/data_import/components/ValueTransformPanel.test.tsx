import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ValueTransformPanel } from "./ValueTransformPanel";
import type { ImportField } from "../types/dataImport";

const fields: ImportField[] = [
  {
    key: "leave_type",
    label: "Leave Type",
    required: true,
    field_type: "choice",
    choices: [
      ["vacation", "Vacation"],
      ["sick", "Sick Leave"],
    ],
  },
  { key: "username", label: "Username", required: true, field_type: "string" },
];

describe("ValueTransformPanel", () => {
  it("renders nothing when no choice fields are mapped", () => {
    const { container } = render(
      <ValueTransformPanel
        fields={fields}
        fieldMapping={{}}
        detectedValues={{}}
        valueTransforms={{}}
        onTransformChange={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders mapped choice field with detected values", () => {
    render(
      <ValueTransformPanel
        fields={fields}
        fieldMapping={{ leave_type: "LeaveType" }}
        detectedValues={{ LeaveType: ["PTO", "SICK"] }}
        valueTransforms={{}}
        onTransformChange={vi.fn()}
      />
    );
    expect(screen.getByText("Leave Type")).toBeInTheDocument();
    expect(screen.getByText("PTO")).toBeInTheDocument();
    expect(screen.getByText("SICK")).toBeInTheDocument();
  });

  it("calls onTransformChange when a canonical value is selected", () => {
    const onTransformChange = vi.fn();
    render(
      <ValueTransformPanel
        fields={fields}
        fieldMapping={{ leave_type: "LeaveType" }}
        detectedValues={{ LeaveType: ["PTO"] }}
        valueTransforms={{}}
        onTransformChange={onTransformChange}
      />
    );

    const trigger = screen.getAllByRole("combobox")[0];
    fireEvent.click(trigger);
    // The dropdown is rendered in a portal; click the last "Vacation" occurrence.
    const options = screen.getAllByText("Vacation");
    fireEvent.click(options[options.length - 1]);

    expect(onTransformChange).toHaveBeenCalledWith("leave_type", "PTO", "vacation");
  });
});
