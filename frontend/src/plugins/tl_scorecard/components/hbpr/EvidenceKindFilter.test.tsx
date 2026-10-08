import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EvidenceKindFilter } from "./EvidenceKindFilter";

describe("EvidenceKindFilter", () => {
  it("marks the active kind with aria-pressed", () => {
    render(<EvidenceKindFilter value="epr_mid_year" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Mid-year EPR" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the picked kind", () => {
    const onChange = vi.fn();
    render(<EvidenceKindFilter value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Cadence meetings" }));
    expect(onChange).toHaveBeenCalledWith("cadence_meeting");
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenCalledWith("all");
  });
});
