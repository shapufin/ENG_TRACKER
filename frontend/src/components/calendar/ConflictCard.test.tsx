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
  it("does not use dark-mode-only -300 text tints that fail AA in light mode", () => {
    expect(html(<ConflictCard conflict={conflict} />)).not.toMatch(
      /text-(emerald|rose|amber|indigo)-300/
    );
  });

  it("renders status and type badges with AA-verified light/dark tint pairs", () => {
    const markup = html(<ConflictCard conflict={conflict} />);
    expect(markup).toContain("text-emerald-800 dark:text-emerald-400");
    expect(markup).toContain("text-rose-800 dark:text-rose-400");
    expect(markup).toContain("text-amber-800 dark:text-amber-400");
  });

  it("does not use raw bg-white surfaces in light mode", () => {
    expect(html(<ConflictCard conflict={conflict} />)).not.toContain("bg-white/50");
  });
});
