import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HRTableShell } from "./HRTableShell";

describe("HRTableShell", () => {
  it("renders column alignment with static Tailwind classes", () => {
    render(
      <HRTableShell
        title="T"
        headers={[
          { label: "Days", align: "right" },
          { label: "Status", align: "center" },
        ]}
      >
        <tr>
          <td>x</td>
        </tr>
      </HRTableShell>
    );
    expect(screen.getByText("Days").className).toContain("text-right");
    expect(screen.getByText("Status").className).toContain("text-center");
  });
});
