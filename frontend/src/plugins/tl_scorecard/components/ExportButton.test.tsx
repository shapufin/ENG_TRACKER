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

describe("ExportButton", () => {
  it("exports the Excel workbook from the menu for the viewed month", async () => {
    exportSummary.mockResolvedValue({ data: new Blob() } as never);
    render(<ExportButton month="2026-10-01" />);
    fireEvent.click(screen.getByRole("button", { name: "Export Summary" }));
    fireEvent.click(await screen.findByRole("button", { name: "Excel workbook (.xlsx)" }));
    await waitFor(() =>
      expect(exportSummary).toHaveBeenCalledWith("2026-10-01", undefined, "xlsx")
    );
    expect(downloadBlobResponse).toHaveBeenCalled();
  });

  it("exports the PDF report from the menu", async () => {
    exportSummary.mockResolvedValue({ data: new Blob() } as never);
    render(<ExportButton month="2026-10-01" leaderId={7} />);
    fireEvent.click(screen.getByRole("button", { name: "Export Summary" }));
    fireEvent.click(await screen.findByRole("button", { name: "PDF report" }));
    await waitFor(() => expect(exportSummary).toHaveBeenCalledWith("2026-10-01", 7, "pdf"));
  });

  it("renders an icon-only toolbar button that opens the same menu", async () => {
    exportSummary.mockResolvedValue({ data: new Blob() } as never);
    render(<ExportButton month="2026-10-01" iconOnly />);
    const button = screen.getByRole("button", { name: "Export summary" });
    expect(button).toHaveAttribute("title", "Export summary");
    fireEvent.click(button);
    fireEvent.click(await screen.findByRole("button", { name: "PDF report" }));
    await waitFor(() => expect(exportSummary).toHaveBeenCalledWith("2026-10-01", undefined, "pdf"));
  });

  it("names the download after the server's Content-Disposition filename", async () => {
    exportSummary.mockResolvedValue({
      data: new Blob(),
      headers: { "content-disposition": 'attachment; filename="tl_scorecard_lead_2026-10.pdf"' },
    } as never);
    render(<ExportButton month="2026-10-01" />);
    fireEvent.click(screen.getByRole("button", { name: "Export Summary" }));
    fireEvent.click(await screen.findByRole("button", { name: "PDF report" }));
    await waitFor(() =>
      expect(downloadBlobResponse).toHaveBeenCalledWith(
        expect.anything(),
        "tl_scorecard_lead_2026-10.pdf"
      )
    );
  });
});
