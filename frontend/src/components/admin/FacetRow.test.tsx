import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FacetRow } from "./FacetRow";

describe("FacetRow", () => {
  it("names the group from its visible label instead of a duplicate aria-label", () => {
    render(
      <>
        <FacetRow label="Tech">
          <button type="button">A</button>
        </FacetRow>
        <FacetRow label="Team">
          <button type="button">B</button>
        </FacetRow>
      </>
    );
    const tech = screen.getByRole("group", { name: "Tech" });
    expect(tech).not.toHaveAttribute("aria-label");
    const labelId = tech.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)).toHaveTextContent("Tech");
    // Two rows get two different ids.
    expect(screen.getByRole("group", { name: "Team" }).getAttribute("aria-labelledby")).not.toBe(
      labelId
    );
  });

  it("lets the label grow past 5rem instead of wrapping awkwardly", () => {
    render(
      <FacetRow label="Permission group">
        <button type="button">A</button>
      </FacetRow>
    );
    const label = screen.getByText("Permission group");
    expect(label.className).toContain("sm:min-w-20");
    expect(label.className).toContain("sm:w-auto");
  });
});
