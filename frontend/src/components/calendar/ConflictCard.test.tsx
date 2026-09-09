import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ConflictCard } from "./ConflictCard";
import type { ConflictEntry } from "./ConflictsModal";

const conflict: ConflictEntry = {
  date: "2026-09-01",
  description: "Conflicting leave requests",
  users: [
    { id: 1, name: "Alice Example", type: "vacation", status: "approved" },
    { id: 2, name: "Bob Example", type: "sick", status: "pending" },
    { id: 3, name: "Carol Example", type: "vacation", status: "rejected" },
  ],
};

const html = (ui: React.ReactElement) => render(ui).container.innerHTML;

describe("ConflictCard", () => {
  // Status/type colour now comes from the tone scale (tone.ts), which already
  // carries the AA-verified light/dark pair per tone — no raw palette classes
  // or `dark:` variants should appear at this callsite.
  it("does not use raw palette classes for status/type badges", () => {
    expect(html(<ConflictCard conflict={conflict} />)).not.toMatch(
      /(text|bg|border)-(emerald|rose|amber|indigo)-\d/
    );
  });

  it("renders status and type badges with tone tokens", () => {
    const markup = html(<ConflictCard conflict={conflict} />);
    expect(markup).toContain("text-tone-success-text");
    expect(markup).toContain("text-tone-danger-text");
    expect(markup).toContain("text-tone-warning-text");
  });

  it("does not use raw bg-white surfaces in light mode", () => {
    expect(html(<ConflictCard conflict={conflict} />)).not.toContain("bg-white/50");
  });
});
