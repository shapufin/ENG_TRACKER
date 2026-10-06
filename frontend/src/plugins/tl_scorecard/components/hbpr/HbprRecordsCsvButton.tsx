import React, { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadBlobResponse } from "@/lib/download";
import { tlScorecardService } from "../../services/tlScorecardService";
import { errorMessage } from "../records/errorMessage";

interface HbprRecordsCsvButtonProps {
  kind: string;
  leader: number | null;
  status: string;
  period: string;
  q: string;
}

/**
 * Server-side CSV of the currently filtered records (the table is
 * server-paged, so — unlike the TL tab — the file cannot be built locally).
 * Filename mirrors the server pattern.
 */
export const HbprRecordsCsvButton: React.FC<HbprRecordsCsvButtonProps> = ({
  kind,
  leader,
  status,
  period,
  q,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setError(null);
    setIsExporting(true);
    try {
      const response = await tlScorecardService.downloadHbprRecordsCsv({
        kind,
        ...(leader !== null && { leader }),
        ...(status && { status }),
        ...(period && { period }),
        ...(q && { q }),
      });
      const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      downloadBlobResponse(response.data, `hbpr-${kind}-records-${stamp}.csv`);
    } catch (err) {
      setError(errorMessage(err, "Export failed"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="icon"
        onClick={handleExport}
        disabled={isExporting}
        aria-label="Export visible records (CSV)"
        title="Export visible records (CSV)"
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
};
