import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ValueTransformPanel } from "./ValueTransformPanel";

describe("Data import panel modernization", () => {
  it("renders transform content as a flat section inside the dialog (no third card surface)", () => {
    const { container } = render(
      <ValueTransformPanel
        fields={[
          {
            key: "status",
            label: "Status",
            required: false,
            field_type: "choice",
            choices: [["active", "Active"]],
          },
        ]}
        fieldMapping={{ status: "Status" }}
        detectedValues={{ Status: ["Active"] }}
        valueTransforms={{}}
        onTransformChange={() => {}}
      />
    );

    expect(screen.getByRole("heading", { name: "Value Transforms" })).toBeInTheDocument();
    expect(container.querySelector(".shadow-card")).not.toBeInTheDocument();
  });
});
