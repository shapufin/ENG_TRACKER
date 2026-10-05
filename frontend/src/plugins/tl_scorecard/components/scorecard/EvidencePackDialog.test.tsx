import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EvidencePackDialog } from "./EvidencePackDialog";
import type { YearEndEvidencePack } from "../../types/tlScorecard";

const PACK: YearEndEvidencePack = {
  assignment: {
    id: 11,
    albanian_tl_name: "Enri Leader",
    hbpr_name: "Elda Partner",
    cadence: "weekly",
    effective_from: "2026-01-01",
    effective_to: null,
  },
  year: 2026,
  cadence_expected: 40,
  cadence_held: 31,
  coverage_pct: 77.5,
  meetings: [
    {
      id: 3,
      occurred_on: "2026-03-01",
      shared_summary: "Weekly governance sync.",
      action_items: "Follow up on attrition.",
      reference_url: "https://notes.example/w10",
      recorded_by_name: "Enri Leader",
    },
  ],
  epr_mid_year: {
    id: 9,
    occurred_on: "2026-06-15",
    shared_summary: "HBPR joined the mid-year review panel.",
    action_items: "",
    reference_url: "",
    recorded_by_name: "Enri Leader",
  },
  epr_year_end: null,
};

const renderDialog = (load = vi.fn().mockResolvedValue(PACK)) =>
  render(<EvidencePackDialog open onOpenChange={vi.fn()} load={load} />);

describe("EvidencePackDialog", () => {
  it("summarises held-vs-expected cadence with coverage", async () => {
    renderDialog();
    expect(await screen.findByText("2026 evidence pack")).toBeInTheDocument();
    expect(screen.getByText("Enri Leader")).toBeInTheDocument();
    expect(screen.getByText("Elda Partner")).toBeInTheDocument();
    expect(screen.getByText("31/40")).toBeInTheDocument();
    expect(screen.getByText("77.5%")).toBeInTheDocument();
  });

  it("lists the meetings and the EPR participation state", async () => {
    renderDialog();
    expect(await screen.findByText("Weekly governance sync.")).toBeInTheDocument();
    expect(screen.getByText("Follow up on attrition.")).toBeInTheDocument();
    expect(screen.getByText("HBPR joined the mid-year review panel.")).toBeInTheDocument();
    expect(screen.getByText(/year-end epr participation: missing/i)).toBeInTheDocument();
  });

  it("surfaces a load failure", async () => {
    render(
      <EvidencePackDialog
        open
        onOpenChange={vi.fn()}
        load={vi.fn().mockRejectedValue(new Error("denied"))}
      />
    );
    expect(await screen.findByText(/could not load the evidence pack/i)).toBeInTheDocument();
  });
});
