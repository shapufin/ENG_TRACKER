import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HbprPartnershipSection } from "./HbprPartnershipSection";
import type { HbprEvidence, HbprPartnership } from "../../types/tlScorecard";

// Radix Select is unreliable to drive via fireEvent in JSDOM: render it flat.
vi.mock("@/components/ui/select", () => {
  const Ctx = React.createContext<{ onValueChange?: (v: string) => void }>({});
  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (v: string) => void;
    }) => <Ctx.Provider value={{ onValueChange }}>{children}</Ctx.Provider>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return (
        <button type="button" role="option" onClick={() => ctx.onValueChange?.(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ id, children }: { id?: string; children: React.ReactNode }) => (
      <button type="button" role="combobox" id={id}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  };
});

const PARTNERSHIP: HbprPartnership = {
  reporting_year: 2026,
  assignment: {
    id: 11,
    hbpr: { id: 5, name: "Elda Partner" },
    cadence: "weekly",
    effective_from: "2026-01-01",
    last_meeting_on: "2026-03-01",
    next_due_on: "2026-03-08",
    cadence_status: "on_track",
    epr_mid_year: false,
    epr_year_end: false,
    evidence_count: 1,
    last_evidence_on: "2026-03-01",
  },
};

const EVIDENCE: HbprEvidence = {
  id: 3,
  assignment: 11,
  albanian_tl: 7,
  hbpr: 5,
  cadence: "weekly",
  kind: "cadence_meeting",
  kind_display: "Cadence meeting",
  occurred_on: "2026-03-01",
  reporting_year: null,
  shared_summary: "Weekly governance sync.",
  action_items: "Follow up on attrition.",
  reference_url: "",
  recorded_by: 7,
  recorded_by_name: "Enri Leader",
  updated_by: null,
  updated_by_name: null,
  next_due_on: null,
  cadence_status: "on_track",
  created_at: "2026-03-01T10:00:00Z",
  updated_at: "2026-03-01T10:00:00Z",
};

const renderSection = (
  overrides: Partial<React.ComponentProps<typeof HbprPartnershipSection>> = {}
) => {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  const onRetry = vi.fn();
  render(
    <HbprPartnershipSection
      partnership={PARTNERSHIP}
      evidence={[]}
      year={2026}
      isLoading={false}
      isError={false}
      onRetry={onRetry}
      canAuthor
      onCreate={onCreate}
      onUpdate={onUpdate}
      {...overrides}
    />
  );
  return { onCreate, onUpdate, onRetry };
};

describe("HbprPartnershipSection", () => {
  beforeEach(() => vi.resetAllMocks());

  it("shows who the HBPR is, the cadence state and the EPR gaps", () => {
    renderSection();
    expect(screen.getByText("Elda Partner")).toBeInTheDocument();
    expect(screen.getByText("On track")).toBeInTheDocument();
    expect(screen.getByText("Mid-year EPR: missing")).toBeInTheDocument();
    expect(screen.getByText("Year-end EPR: missing")).toBeInTheDocument();
  });

  it("tells an unpaired team leader there is no HBPR yet", () => {
    renderSection({ partnership: { reporting_year: 2026, assignment: null } });
    expect(screen.getByText("No HR business partner assigned yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record evidence/i })).not.toBeInTheDocument();
  });

  it("is read-only for a viewer who cannot author", () => {
    renderSection({ canAuthor: false, evidence: [EVIDENCE] });
    expect(screen.queryByRole("button", { name: /record evidence/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.getByText("Weekly governance sync.")).toBeInTheDocument();
  });

  it("shows a retryable error", () => {
    const { onRetry } = renderSection({ isError: true });
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("records a cadence meeting for the assignment", async () => {
    const { onCreate } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /record evidence/i }));

    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Discussed Q2 goals" } });
    fireEvent.click(screen.getByRole("button", { name: "Record evidence" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          assignment: 11,
          kind: "cadence_meeting",
          reporting_year: null,
          shared_summary: "Discussed Q2 goals",
        })
      )
    );
  });

  it("requires a reporting year for EPR participation", async () => {
    const { onCreate } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /record evidence/i }));

    fireEvent.click(screen.getByRole("option", { name: "EPR mid-year participation" }));
    const yearInput = await screen.findByLabelText("Reporting year");
    fireEvent.change(yearInput, { target: { value: "1999" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/between 2000 and 2100/i);
    expect(screen.getByRole("button", { name: "Record evidence" })).toBeDisabled();

    fireEvent.change(yearInput, { target: { value: "2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Record evidence" }));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "epr_mid_year", reporting_year: 2026 })
      )
    );
  });

  it("edits an existing evidence row through the dialog", async () => {
    const { onUpdate } = renderSection({ evidence: [EVIDENCE] });
    fireEvent.click(screen.getByRole("button", { name: /edit cadence meeting/i }));

    const summary = await screen.findByLabelText("Summary");
    expect(summary).toHaveValue("Weekly governance sync.");
    fireEvent.change(summary, { target: { value: "Revised summary" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ assignment: 11, shared_summary: "Revised summary" })
      )
    );
  });
});
