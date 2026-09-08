import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TargetPicker } from "./TargetPicker";

describe("TargetPicker modernization", () => {
  it("uses GlassCard target tiles", () => {
    const { container } = render(
      <TargetPicker
        targets={[
          {
            target_key: "users",
            display_name: "Users",
            description: "Users",
            fields: [],
            dedupe_keys: [],
          },
        ]}
        selectedTargetKey={null}
        onSelect={() => {}}
      />
    );

    expect(container.querySelector(".shadow-glass")).toBeInTheDocument();
  });
});
