import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmailThreadViewer } from "./EmailThreadViewer";

const email = {
  subject: "Monthly KPI export",
  from: "ops@example.com",
  date: "2026-09-01T10:00:00Z",
  to: ["tl@example.com"],
  cc: [],
  body_plain: `Line with a very long URL https://${"x".repeat(300)}.example.com/report that must wrap`,
  body_html: null,
  attachments: [],
} as any;

// Scroll contract: sticky title, scrollable body, wrapping long content.
describe("EmailThreadViewer scroll contract", () => {
  it("dialog keeps a sticky header with a scrollable wrapping body", () => {
    render(<EmailThreadViewer open onOpenChange={vi.fn()} email={email} isLoading={false} />);
    expect(screen.getByText("Monthly KPI export")).toBeInTheDocument();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).not.toContain("overflow-y-auto");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
    expect(dlg.querySelectorAll(".break-words").length).toBeGreaterThan(0);
  });
});
