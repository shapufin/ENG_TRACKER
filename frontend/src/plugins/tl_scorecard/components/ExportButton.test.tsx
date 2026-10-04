import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExportButton } from "./ExportButton";
import { tlScorecardService } from "../services/tlScorecardService";
import { downloadBlobResponse } from "@/lib/download";

vi.mock("../services/tlScorecardService", () => ({
  tlScorecardService: { exportWorkbook: vi.fn() },
}));

vi.mock("@/lib/download", () => ({
  downloadBlobResponse: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("ExportButton", () => {
  it("exports the workbook for the viewed month", async () => {
    vi.mocked(tlScorecardService.exportWorkbook).mockResolvedValue({ data: new Blob() } as never);
    render(<ExportButton month="2026-10-01" />);
    fireEvent.click(screen.getByRole("button", { name: "Export Report" }));
    await waitFor(() =>
      expect(tlScorecardService.exportWorkbook).toHaveBeenCalledWith("2026-10-01", undefined)
    );
    expect(downloadBlobResponse).toHaveBeenCalled();
  });

  it("renders an icon-only toolbar button that exports the same workbook", async () => {
    vi.mocked(tlScorecardService.exportWorkbook).mockResolvedValue({ data: new Blob() } as never);
    render(<ExportButton month="2026-10-01" iconOnly />);
    const button = screen.getByRole("button", { name: "Export report" });
    expect(button).toHaveAttribute("title", "Export report");
    fireEvent.click(button);
    await waitFor(() =>
      expect(tlScorecardService.exportWorkbook).toHaveBeenCalledWith("2026-10-01", undefined)
    );
  });
});
