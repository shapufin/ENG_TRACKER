import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecordDetailModal } from "./RecordDetailModal";

const record = {
  id: 1,
  date: "2026-09-05",
  start_time: "18:00",
  end_time: "20:00",
  hours: 2,
  client_name: "SIAE",
  description: "Deploy support",
  evidence_type: "ticket",
  ticket_references: ["TCK-1"],
  evidence: `A very long evidence note ${"y".repeat(300)} that must wrap, not truncate`,
  reference_code: "REF-1",
  approved_by_name: "TL",
  approved_at: null,
  rejection_reason: `Rejected because ${"z".repeat(200)}`,
  status: "pending",
  user_full_name: "Enri Demnushi",
} as any;

// Scroll contract: outer height guard + sticky header; long evidence/reason
// values wrap; title uses the theme foreground (not hardcoded white, which
// is invisible on the light popover surface); close meets 44px target.
describe("RecordDetailModal scroll contract", () => {
  it("dialog is a bounded flex column with a sticky header and scrollable grid", () => {
    render(<RecordDetailModal open onOpenChange={vi.fn()} record={record} />);
    expect(screen.getByText("Overtime")).toBeInTheDocument();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).toContain("max-h-[90vh]");
    // Mockup balance modal is max-w-xl; the field grid needs the room.
    expect(dlg.className).toContain("max-w-xl");
    expect(dlg.className).not.toContain("overflow-y-auto");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".shrink-0").length).toBeGreaterThan(0);
  });

  it("long evidence values wrap and the title uses theme foreground", () => {
    render(<RecordDetailModal open onOpenChange={vi.fn()} record={record} />);
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.querySelectorAll(".break-words").length).toBeGreaterThan(0);
    const title = screen.getByText("Overtime");
    expect(title.className).toContain("text-foreground");
    expect(title.className).not.toMatch(/(^|\s)text-white(\s|$)/);
    const close = dlg.querySelector("button") as HTMLElement;
    expect(close.className).toContain("h-11");
  });
});
