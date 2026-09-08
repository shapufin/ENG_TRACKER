import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FieldsPopulatedBadges } from "./FieldsPopulatedBadges";

describe("FieldsPopulatedBadges", () => {
  it("shows 'No fields' when fields is empty", () => {
    render(<FieldsPopulatedBadges fields={[]} />);
    expect(screen.getByText("No fields")).toBeInTheDocument();
  });

  it("shows 'No fields' when fields is undefined", () => {
    render(<FieldsPopulatedBadges fields={undefined} />);
    expect(screen.getByText("No fields")).toBeInTheDocument();
  });

  it("renders a badge per field up to max", () => {
    render(<FieldsPopulatedBadges fields={["tickets", "resolution_time", "sla", "category"]} />);
    expect(screen.getByText("Tickets")).toBeInTheDocument();
    expect(screen.getByText("Resolution")).toBeInTheDocument();
    expect(screen.getByText("SLA")).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
  });

  it("shows overflow count when fields exceed max", () => {
    render(
      <FieldsPopulatedBadges
        fields={["tickets", "resolution_time", "sla", "category", "priority", "status"]}
        max={4}
      />
    );
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("renders unknown field keys with the raw label", () => {
    render(<FieldsPopulatedBadges fields={["custom_field"]} />);
    expect(screen.getByText("custom_field")).toBeInTheDocument();
  });
});
