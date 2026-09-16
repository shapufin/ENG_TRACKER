import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UploadPreviewPanel } from "./UploadPreviewPanel";
import type { UploadPreview } from "../types/ticketKPI";

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={() => onCheckedChange(!checked)}
      data-testid="save-mapping-checkbox"
    />
  ),
}));

const basePreview: UploadPreview = {
  total_records: 3,
  preview_rows: [],
  issues: {},
  status_breakdown: {},
  priority_breakdown: {},
  category_breakdown: {},
  errors: [],
};

const baseProps = {
  onImport: vi.fn(),
  isImporting: false,
  detectedColumns: ["Number", "Short description", "State"],
  currentMapping: { ticket_id: "Number" },
  onRemap: vi.fn(),
  isRemapping: false,
  canSaveMapping: false,
  saveMappingOverrides: false,
  onSaveMappingOverridesChange: vi.fn(),
};

describe("UploadPreviewPanel", () => {
  it("renders a warning banner listing missing-field issues", () => {
    render(
      <UploadPreviewPanel
        {...baseProps}
        preview={{ ...basePreview, issues: { missing_status: 4, missing_assignee: 1 } }}
      />
    );
    expect(screen.getByText(/Some fields look unmapped or empty/)).toBeInTheDocument();
    expect(screen.getByText(/4 rows missing Status/)).toBeInTheDocument();
    expect(screen.getByText(/1 row missing Assignee/)).toBeInTheDocument();
  });

  it("shows no issues banner when there are no issues", () => {
    render(<UploadPreviewPanel {...baseProps} preview={basePreview} />);
    expect(screen.queryByText(/Some fields look unmapped or empty/)).not.toBeInTheDocument();
    expect(screen.getByText("Fix column mapping")).toBeInTheDocument();
  });

  it("opens the mapping fix editor and calls onRemap with the edited mapping", () => {
    const onRemap = vi.fn();
    render(
      <UploadPreviewPanel
        {...baseProps}
        onRemap={onRemap}
        preview={{ ...basePreview, issues: { missing_status: 2 } }}
      />
    );
    fireEvent.click(screen.getByText("Fix column mapping"));
    fireEvent.click(screen.getByText("Re-preview with this mapping"));
    expect(onRemap).toHaveBeenCalledWith({ ticket_id: "Number" });
  });

  it("hides the save-to-profile checkbox when the user cannot save mapping", () => {
    render(
      <UploadPreviewPanel
        {...baseProps}
        canSaveMapping={false}
        preview={{ ...basePreview, issues: { missing_status: 1 } }}
      />
    );
    fireEvent.click(screen.getByText("Fix column mapping"));
    expect(screen.queryByTestId("save-mapping-checkbox")).not.toBeInTheDocument();
  });

  it("shows the save-to-profile checkbox when the user can save mapping", () => {
    const onSaveMappingOverridesChange = vi.fn();
    render(
      <UploadPreviewPanel
        {...baseProps}
        canSaveMapping={true}
        onSaveMappingOverridesChange={onSaveMappingOverridesChange}
        preview={{ ...basePreview, issues: { missing_status: 1 } }}
      />
    );
    fireEvent.click(screen.getByText("Fix column mapping"));
    fireEvent.click(screen.getByTestId("save-mapping-checkbox"));
    expect(onSaveMappingOverridesChange).toHaveBeenCalledWith(true);
  });
});
