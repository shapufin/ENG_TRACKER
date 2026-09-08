import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HRReportActionBar } from "./HRReportActionBar";

const baseProps = {
  exportDialogOpen: false,
  onExportDialogOpenChange: vi.fn(),
  exportType: "ot-standby" as const,
  onExportTypeChange: vi.fn(),
  exportStatus: "approved" as const,
  onExportStatusChange: vi.fn(),
  exportLoading: false,
  onExport: vi.fn(),
  start: "2024-01-01",
  end: "2024-01-31",
  selectedItalianTL: "all",
  selectedAlbanianTL: "none",
  selectedWorkspace: "all",
  italianTLs: [{ id: 1, full_name: "Mario", member_count: 5 }],
  albanianTLs: [{ id: 2, full_name: "Bledi", member_count: 3 }],
};

describe("HRReportActionBar", () => {
  it("renders all export buttons", () => {
    render(<HRReportActionBar {...baseProps} />);
    expect(screen.getByText("Export OT & Standby")).toBeInTheDocument();
    expect(screen.getByText("Export Pending")).toBeInTheDocument();
    expect(screen.getByText("Export Leave")).toBeInTheDocument();
    expect(screen.getByText("Export for Payroll")).toBeInTheDocument();
  });

  it("opens export dialog and exports", () => {
    const onExport = vi.fn();
    render(<HRReportActionBar {...baseProps} exportDialogOpen={true} onExport={onExport} />);
    fireEvent.click(screen.getByText("Export"));
    expect(onExport).toHaveBeenCalled();
  });

  it("shows leave export dialog", () => {
    render(<HRReportActionBar {...baseProps} exportDialogOpen={true} exportType="leave" />);
    expect(screen.getByRole("heading", { name: "Export Leave" })).toBeInTheDocument();
  });

  it("shows pending export dialog", () => {
    render(
      <HRReportActionBar
        {...baseProps}
        exportDialogOpen={true}
        exportType="ot-standby"
        exportStatus="pending"
      />
    );
    expect(
      screen.getByRole("heading", { name: "Export Pending OT & Standby" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Pending only/)).toBeInTheDocument();
  });

  it("renders export dialog with specific TLs and workspace", () => {
    render(
      <HRReportActionBar
        {...baseProps}
        exportDialogOpen={true}
        exportType="ot-standby"
        selectedItalianTL="1"
        selectedAlbanianTL="2"
        selectedWorkspace="WS"
      />
    );
    expect(screen.getByText(/Italian TL: Mario/)).toBeInTheDocument();
    expect(screen.getByText(/Albanian TL: Bledi/)).toBeInTheDocument();
    expect(screen.getByText(/Workspace: WS/)).toBeInTheDocument();
  });

  it("renders export dialog with unknown TL fallback", () => {
    render(
      <HRReportActionBar
        {...baseProps}
        exportDialogOpen={true}
        selectedItalianTL="99"
        selectedAlbanianTL="99"
      />
    );
    expect(screen.getByText(/Italian TL: 99/)).toBeInTheDocument();
    expect(screen.getByText(/Albanian TL: 99/)).toBeInTheDocument();
  });

  it("cancels export dialog", () => {
    const onExportDialogOpenChange = vi.fn();
    render(
      <HRReportActionBar
        {...baseProps}
        exportDialogOpen={true}
        onExportDialogOpenChange={onExportDialogOpenChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onExportDialogOpenChange).toHaveBeenCalledWith(false);
  });

  it("triggers export OT & Standby dialog with approved status", () => {
    const onExportTypeChange = vi.fn();
    const onExportStatusChange = vi.fn();
    const onExportDialogOpenChange = vi.fn();
    render(
      <HRReportActionBar
        {...baseProps}
        onExportTypeChange={onExportTypeChange}
        onExportStatusChange={onExportStatusChange}
        onExportDialogOpenChange={onExportDialogOpenChange}
      />
    );
    fireEvent.click(screen.getByText("Export OT & Standby"));
    expect(onExportTypeChange).toHaveBeenCalledWith("ot-standby");
    expect(onExportStatusChange).toHaveBeenCalledWith("approved");
    expect(onExportDialogOpenChange).toHaveBeenCalledWith(true);
  });

  it("triggers export Pending dialog with pending status", () => {
    const onExportTypeChange = vi.fn();
    const onExportStatusChange = vi.fn();
    const onExportDialogOpenChange = vi.fn();
    render(
      <HRReportActionBar
        {...baseProps}
        onExportTypeChange={onExportTypeChange}
        onExportStatusChange={onExportStatusChange}
        onExportDialogOpenChange={onExportDialogOpenChange}
      />
    );
    fireEvent.click(screen.getByText("Export Pending"));
    expect(onExportTypeChange).toHaveBeenCalledWith("ot-standby");
    expect(onExportStatusChange).toHaveBeenCalledWith("pending");
    expect(onExportDialogOpenChange).toHaveBeenCalledWith(true);
  });

  it("triggers export Leave dialog", () => {
    const onExportTypeChange = vi.fn();
    const onExportStatusChange = vi.fn();
    const onExportDialogOpenChange = vi.fn();
    render(
      <HRReportActionBar
        {...baseProps}
        onExportTypeChange={onExportTypeChange}
        onExportStatusChange={onExportStatusChange}
        onExportDialogOpenChange={onExportDialogOpenChange}
      />
    );
    fireEvent.click(screen.getByText("Export Leave"));
    expect(onExportTypeChange).toHaveBeenCalledWith("leave");
    expect(onExportStatusChange).toHaveBeenCalledWith("approved");
    expect(onExportDialogOpenChange).toHaveBeenCalledWith(true);
  });

  it("triggers Export for Payroll dialog with processing-period mode", () => {
    const onExportTypeChange = vi.fn();
    const onExportStatusChange = vi.fn();
    const onExportDialogOpenChange = vi.fn();
    render(
      <HRReportActionBar
        {...baseProps}
        onExportTypeChange={onExportTypeChange}
        onExportStatusChange={onExportStatusChange}
        onExportDialogOpenChange={onExportDialogOpenChange}
      />
    );
    fireEvent.click(screen.getByText("Export for Payroll"));
    expect(onExportTypeChange).toHaveBeenCalledWith("payroll");
    expect(onExportStatusChange).toHaveBeenCalledWith("approved");
    expect(onExportDialogOpenChange).toHaveBeenCalledWith(true);
  });

  it("shows payroll export dialog with processing-period description", () => {
    render(
      <HRReportActionBar
        {...baseProps}
        exportDialogOpen={true}
        exportType="payroll"
      />
    );
    expect(
      screen.getByRole("heading", { name: "Export for Payroll (by Processing Period)" })
    ).toBeInTheDocument();
    expect(screen.getByText(/carryover-aware/i)).toBeInTheDocument();
  });
});
