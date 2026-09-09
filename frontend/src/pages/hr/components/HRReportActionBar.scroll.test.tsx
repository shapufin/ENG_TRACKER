import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HRReportActionBar } from "./HRReportActionBar";

const baseProps = {
  exportDialogOpen: false,
  onExportDialogOpenChange: vi.fn(),
  exportType: "leave" as const,
  onExportTypeChange: vi.fn(),
  exportStatus: "approved" as const,
  onExportStatusChange: vi.fn(),
  exportLoading: false,
  onExport: vi.fn(),
  start: "2026-09-01",
  end: "2026-09-30",
  selectedItalianTL: "all",
  selectedAlbanianTL: "all",
  selectedWorkspace: "all",
};

// Phase 6 mechanical rollout: scroll contract on the export dialog.
describe("HRReportActionBar export dialog", () => {
  it("keeps the scroll contract with header, scrollable body and footer", () => {
    render(<HRReportActionBar {...baseProps} exportDialogOpen />);
    expect(screen.getByRole("heading", { name: "Export Leave" })).toBeInTheDocument();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).not.toMatch(/(^|\s)overflow-y-auto/);
    const body = dlg.querySelector(".flex-1.overflow-y-auto");
    expect(body).not.toBeNull();
    expect(body?.className).toContain("no-scrollbar");
    expect(dlg.querySelectorAll(".shrink-0").length).toBeGreaterThan(0);
  });

  it("exports through the footer action", () => {
    const onExport = vi.fn();
    render(<HRReportActionBar {...baseProps} exportDialogOpen onExport={onExport} />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});
