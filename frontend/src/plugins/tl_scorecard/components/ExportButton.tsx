import React, { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadBlobResponse } from "@/lib/download";
import { tlScorecardService } from "../services/tlScorecardService";

interface ExportButtonProps {
  leaderId?: number;
  /** ISO date inside the month to export; defaults to the current month. */
  month?: string;
  /** Icon-only toolbar rendering (same workbook, same errors). */
  iconOnly?: boolean;
  /** Button label; defaults to "Export Summary". */
  label?: string;
}

export const ExportButton: React.FC<ExportButtonProps> = ({
  leaderId,
  month,
  iconOnly,
  label = "Export Summary",
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const response = await tlScorecardService.exportWorkbook(month, leaderId);
      downloadBlobResponse(
        response.data,
        `tl-scorecard-${(month ?? new Date().toISOString()).slice(0, 7)}.xlsx`
      );
    } catch (e) {
      const forbidden = (e as { response?: { status?: number } } | null)?.response?.status === 403;
      const message = forbidden
        ? "You do not have permission to export this report."
        : "The report could not be exported. Try again.";
      setError(message);
      toast.error(message);
    } finally {
      setIsExporting(false);
    }
  };

  if (iconOnly) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button
          variant="outline"
          size="icon"
          onClick={handleExport}
          disabled={isExporting}
          aria-label="Export summary"
          title="Export summary"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
        </Button>
        {error && (
          <p role="alert" className="text-tone-danger-text text-xs">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
        <Download className="mr-2 h-4 w-4" />
        {isExporting ? "Exporting…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-tone-danger-text text-xs">
          {error}
        </p>
      )}
    </div>
  );
};
