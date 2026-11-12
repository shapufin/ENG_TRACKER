import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AttendedEmployees } from "./AttendedEmployees";

describe("AttendedEmployees", () => {
  it("names every employee whose review the HBPR attended", () => {
    render(
      <AttendedEmployees
        employees={[
          { user_id: 1, name: "Ana Dervishi" },
          { user_id: 2, name: "Besi Hoxha" },
        ]}
      />
    );
    expect(screen.getByText("HBPR attended (2)")).toBeInTheDocument();
    expect(screen.getByText("Ana Dervishi")).toBeInTheDocument();
    expect(screen.getByText("Besi Hoxha")).toBeInTheDocument();
  });

  it("renders nothing for cadence rows or when nobody attended", () => {
    const { container } = render(<AttendedEmployees employees={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
