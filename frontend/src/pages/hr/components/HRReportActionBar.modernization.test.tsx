import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HRReportActionBar } from "./HRReportActionBar";

describe("HRReportActionBar modernization", () => {
  it("uses semantic status colors in export actions", () => {
    const { container } = render(
      <HRReportActionBar
        exportDialogOpen={false}
        onExportDialogOpenChange={() => {}}
        exportType="ot-standby"
        onExportTypeChange={() => {}}
        exportStatus="approved"
        onExportStatusChange={() => {}}
        exportLoading={false}
        onExport={() => {}}
        start=""
        end=""
        selectedItalianTL="all"
        selectedAlbanianTL="all"
        selectedWorkspace="all"
      />
    );

    expect(container.querySelector('[class*="hover:bg-blue-50"]')).toBeNull();
    expect(container.querySelector('[class*="hover:bg-green-50"]')).toBeNull();
    expect(container.querySelector('[class*="hover:bg-amber-50"]')).toBeNull();
  });
});
