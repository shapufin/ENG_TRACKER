import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExportButton } from "./ExportButton";
import { tlScorecardService } from "../services/tlScorecardService";
import { downloadBlobResponse } from "@/lib/download";

vi.mock("../services/tlScorecardService", () => ({
  tlScorecardService: { exportSummary: vi.fn() },
}));

vi.mock("@/lib/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/download")>()),
  downloadBlobResponse: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const exportSummary = vi.mocked(tlScorecardService.exportSummary);

const openTrigger = (button: HTMLElement) =>
  fireEvent.pointerDown(button, { button: 0, ctrlKey: false });

describe("ExportButton", () => {
  it("exports the Excel workbook from the menu for the viewed month", async () => {
    exportSummary.mockResolvedValue({ data: new Blob() } as never);
    render(<ExportButton month="2026-10-01" />);
    openTrigger(screen.getByRole("button", { name: "Export Summary" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Excel — this month" }));
    await waitFor(() =>
      expect(exportSummary).toHaveBeenCalledWith("2026-10-01", undefined, "xlsx", "month")
    );
    expect(downloadBlobResponse).toHaveBeenCalled();
  });

  it("exports the PDF report from the menu", async () => {
    exportSummary.mockResolvedValue({ data: new Blob() } as never);
    render(<ExportButton month="2026-10-01" leaderId={7} />);
    openTrigger(screen.getByRole("button", { name: "Export Summary" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "PDF report — this month" }));
    await waitFor(() =>
      expect(exportSummary).toHaveBeenCalledWith("2026-10-01", 7, "pdf", "month")
    );
  });

  it.each([
    ["Excel — full year", "xlsx"],
    ["PDF report — full year", "pdf"],
  ])("exports %s from January through the viewed month", async (label, format) => {
    exportSummary.mockResolvedValue({ data: new Blob() } as never);
    render(<ExportButton month="2026-10-01" leaderId={7} />);
    openTrigger(screen.getByRole("button", { name: "Export Summary" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: label }));
    await waitFor(() =>
      expect(exportSummary).toHaveBeenCalledWith("2026-10-01", 7, format, "year")
    );
    // Without a readable Content-Disposition the fallback names the year, not the month.
    expect(downloadBlobResponse).toHaveBeenCalledWith(
      expect.anything(),
      `tl-scorecard-year-2026.${format}`
    );
  });

  it("renders an icon-only toolbar button that opens the same menu", async () => {
    exportSummary.mockResolvedValue({ data: new Blob() } as never);
    render(<ExportButton month="2026-10-01" iconOnly />);
    const button = screen.getByRole("button", { name: "Export summary" });
    expect(button).toHaveAttribute("title", "Export summary");
    openTrigger(button);
    fireEvent.click(await screen.findByRole("menuitem", { name: "PDF report — this month" }));
    await waitFor(() =>
      expect(exportSummary).toHaveBeenCalledWith("2026-10-01", undefined, "pdf", "month")
    );
  });

  it("names the download after the server's Content-Disposition filename", async () => {
    exportSummary.mockResolvedValue({
      data: new Blob(),
      headers: { "content-disposition": 'attachment; filename="tl_scorecard_lead_2026-10.pdf"' },
    } as never);
    render(<ExportButton month="2026-10-01" />);
    openTrigger(screen.getByRole("button", { name: "Export Summary" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "PDF report — this month" }));
    await waitFor(() =>
      expect(downloadBlobResponse).toHaveBeenCalledWith(
        expect.anything(),
        "tl_scorecard_lead_2026-10.pdf"
      )
    );
  });
});
