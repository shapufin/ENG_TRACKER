import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RejectionReasonDialog } from "./RejectionReasonDialog";

// Mechanical pass: shared Textarea + accessible label (was a raw
// placeholder-only <textarea>).
describe("RejectionReasonDialog labels", () => {
  it("reason field uses the shared Textarea with an associated label", () => {
    render(<RejectionReasonDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    const field = screen.getByLabelText(/rejection reason/i);
    expect(field.tagName).toBe("TEXTAREA");
    expect(document.querySelectorAll("textarea:not([id])").length).toBe(0);
  });

  it("follows the modal scroll contract (header/body/footer)", () => {
    render(<RejectionReasonDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).toContain("max-h-[90vh]");
    expect(dlg.className).not.toContain("overflow-y-auto");
    const body = document.querySelector(".flex-1.overflow-y-auto") as HTMLElement;
    expect(body.className).toContain("no-scrollbar");
    expect(document.querySelectorAll(".shrink-0").length).toBeGreaterThan(0);
  });
});
