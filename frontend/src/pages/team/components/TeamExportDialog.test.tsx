import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TeamExportDialog } from "./TeamExportDialog";
import { reportService } from "@/services/reportService";

vi.mock("@/services/reportService", () => ({
  reportService: {
    exportOTStandby: vi.fn(),
    exportLeave: vi.fn(),
  },
}));

// jsdom doesn't implement scrollIntoView, which Radix's Select calls on
// open — render the content flat (no portal/positioning) so option clicks
// work without it, same pattern as MySkillsPage.test.tsx.
vi.mock("@/components/ui/select", () => {
  const SelectContext = React.createContext<{ onValueChange?: (value: string) => void }>({});
  return {
    Select: ({ children, onValueChange }: any) => (
      <SelectContext.Provider value={{ onValueChange }}>{children}</SelectContext.Provider>
    ),
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ value, children }: any) => {
      const context = React.useContext(SelectContext);
      return (
        <button type="button" role="option" onClick={() => context.onValueChange?.(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children, id }: any) => (
      <button type="button" role="combobox" id={id}>
        {children}
      </button>
    ),
    SelectValue: () => null,
  };
});

vi.mock("@/lib/download", () => ({
  downloadBlobResponse: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("TeamExportDialog", () => {
  it("exports OT & Standby (approved, the default) without any team/TL selector", async () => {
    (reportService.exportOTStandby as ReturnType<typeof vi.fn>).mockResolvedValue(new Blob());
    const { downloadBlobResponse } = await import("@/lib/download");
    render(<TeamExportDialog open={true} onOpenChange={vi.fn()} />);

    // No team/TL picker — a TL's export is implicitly scoped server-side.
    expect(screen.queryByText(/italian tl/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /team/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => {
      expect(reportService.exportOTStandby).toHaveBeenCalledWith({
        start_date: undefined,
        end_date: undefined,
        status: "approved",
      });
    });
    expect(downloadBlobResponse).toHaveBeenCalledWith(expect.any(Blob), expect.stringContaining("team_ot_standby_export_"));
  });

  it("exports Leave records when that record type is selected", async () => {
    (reportService.exportLeave as ReturnType<typeof vi.fn>).mockResolvedValue(new Blob());
    render(<TeamExportDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("option", { name: "Leave" }));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => {
      expect(reportService.exportLeave).toHaveBeenCalledWith({
        start_date: undefined,
        end_date: undefined,
      });
    });
  });

  it("shows a toast and keeps the dialog open when the export request fails", async () => {
    (reportService.exportOTStandby as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const onOpenChange = vi.fn();
    const { toast } = await import("sonner");
    render(<TeamExportDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
