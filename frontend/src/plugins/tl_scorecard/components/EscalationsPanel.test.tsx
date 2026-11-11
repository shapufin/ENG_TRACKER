import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EscalationsPanel } from "./EscalationsPanel";

describe("EscalationsPanel", () => {
  it("shows an empty state when there are no candidates", () => {
    render(<EscalationsPanel candidates={[]} />);
    expect(screen.getByText("Nothing needs escalating")).toBeInTheDocument();
  });

  it("renders each candidate with its detail and a labeled kind", () => {
    render(
      <EscalationsPanel
        candidates={[
          {
            kind: "idle_flag_stale", subject_id: 1, subject_name: "Jane Doe",
            detail: "Idle flag open with no status update since 2026-08-01.", since: "2026-08-01",
          },
        ]}
      />
    );
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Idle flag stale")).toBeInTheDocument();
  });
});
