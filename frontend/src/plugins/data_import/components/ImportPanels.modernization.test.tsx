import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ValueTransformPanel } from "./ValueTransformPanel";

describe("Data import panel modernization", () => {
  it("renders transform content on the shared GlassCard surface", () => {
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

    expect(container.querySelector(".shadow-glass")).toBeInTheDocument();
  });
});
