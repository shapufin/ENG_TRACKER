import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HbprRecordsCsvButton } from "./HbprRecordsCsvButton";
import { tlScorecardService } from "../../services/tlScorecardService";
import { downloadBlobResponse } from "@/lib/download";

vi.mock("../../services/tlScorecardService", () => ({
  tlScorecardService: { downloadHbprRecordsCsv: vi.fn() },
}));

vi.mock("@/lib/download", () => ({ downloadBlobResponse: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("HbprRecordsCsvButton", () => {
  it("downloads the filtered records as CSV", async () => {
    vi.mocked(tlScorecardService.downloadHbprRecordsCsv).mockResolvedValue({
      data: new Blob(["a"]),
    } as never);
    render(
      <HbprRecordsCsvButton kind="absences" leader={7} status="open" period="2026-10" q="flu" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Export visible records (CSV)" }));
    await waitFor(() =>
      expect(tlScorecardService.downloadHbprRecordsCsv).toHaveBeenCalledWith({
        kind: "absences",
        leader: 7,
        status: "open",
        period: "2026-10",
        q: "flu",
      })
    );
    const [, filename] = vi.mocked(downloadBlobResponse).mock.calls[0];
    expect(filename).toMatch(/^hbpr-absences-records-\d{8}\.csv$/);
  });

  it("shows the server message when the export fails", async () => {
    vi.mocked(tlScorecardService.downloadHbprRecordsCsv).mockRejectedValue(
      new Error("Export failed")
    );
    render(<HbprRecordsCsvButton kind="meetings" leader={null} status="" period="" q="" />);
    fireEvent.click(screen.getByRole("button", { name: "Export visible records (CSV)" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
