import React, { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadBlobResponse, parseFilenameFromDisposition } from "@/lib/download";
import {
  tlScorecardService,
  type SummaryFileFormat,
  type SummaryScope,
} from "../services/tlScorecardService";

interface ExportButtonProps {
  leaderId?: number;
  /** ISO date inside the month to export; defaults to the current month. */
  month?: string;
  /** Icon-only toolbar rendering (same menu, same errors). */
  iconOnly?: boolean;
  /** Button label; defaults to "Export Summary". */
  label?: string;
}

// Same wording as the Engagement "Export Report" menu.
const EXPORT_OPTIONS: { format: SummaryFileFormat; scope: SummaryScope; label: string }[] = [
  { format: "xlsx", scope: "month", label: "Excel — this month" },
  { format: "xlsx", scope: "year", label: "Excel — full year" },
  { format: "pdf", scope: "month", label: "PDF report — this month" },
  { format: "pdf", scope: "year", label: "PDF report — full year" },
];

export const ExportButton: React.FC<ExportButtonProps> = ({
  leaderId,
  month,
  iconOnly,
  label = "Export Summary",
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (fileFormat: SummaryFileFormat, scope: SummaryScope) => {
    setIsExporting(true);
    setError(null);
    try {
      const response = await tlScorecardService.exportSummary(month, leaderId, fileFormat, scope);
      const period = (month ?? new Date().toISOString()).slice(0, 7);
      const fallback =
        scope === "year"
          ? `tl-scorecard-year-${period.slice(0, 4)}.${fileFormat}`
          : `tl-scorecard-${period}.${fileFormat}`;
      downloadBlobResponse(
        response.data,
        parseFilenameFromDisposition(response.headers?.["content-disposition"], fallback)
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

  const trigger = iconOnly ? (
    <Button
      variant="outline"
      size="icon"
      disabled={isExporting}
      aria-label="Export summary"
      title="Export summary"
    >
      <Download className="h-4 w-4" aria-hidden="true" />
    </Button>
  ) : (
    <Button variant="outline" size="sm" disabled={isExporting}>
      <Download className="mr-2 h-4 w-4" />
      {isExporting ? "Exporting…" : label}
    </Button>
  );

  return (
    <div className="flex flex-col items-start gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {EXPORT_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={`${option.format}-${option.scope}`}
              onSelect={() => handleExport(option.format, option.scope)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p role="alert" className="text-tone-danger-text text-xs">
          {error}
        </p>
      )}
    </div>
  );
};
