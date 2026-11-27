import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { exportData } from "@/utils/exportUtils";

interface HoursLogExportButtonsProps<T extends object> {
  logs: T[];
  filename: string;
  csvHeaders: string[];
  rowMapper: (l: T) => string[];
  /** When provided, exports fetch the full dataset first (bypassing UI pagination). */
  onFetchAll?: () => Promise<T[]>;
  /**
   * When provided, the CSV button triggers a server-side streaming CSV
   * download via this callback instead of building the CSV client-side.
   * The JSON button still uses ``onFetchAll`` + ``exportData``.
   */
  onExportCsv?: () => Promise<void>;
}

export const HoursLogExportButtons = <T extends object>({
  logs,
  filename,
  csvHeaders,
  rowMapper,
  onFetchAll,
  onExportCsv,
}: HoursLogExportButtonsProps<T>) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      if (onExportCsv) {
        await onExportCsv();
      } else {
        const rows = onFetchAll ? await onFetchAll() : logs;
        exportData(rows, filename, "csv", { headers: csvHeaders, rowMapper });
      }
    } catch {
      toast.error("Export failed", {
        description: "Could not fetch all records for export. Please try again.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJson = async () => {
    try {
      setIsExporting(true);
      const rows = onFetchAll ? await onFetchAll() : logs;
      exportData(rows, filename, "json");
    } catch {
      toast.error("Export failed", {
        description: "Could not fetch all records for export. Please try again.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="control" className="md:hidden" disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => void handleExportCsv()}>CSV</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleExportJson()}>JSON</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="hidden flex-wrap items-center justify-end gap-2 md:flex">
        <Button variant="outline" size="control" onClick={handleExportCsv} disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Export CSV
        </Button>
        <Button variant="outline" size="control" onClick={handleExportJson} disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Export JSON
        </Button>
      </div>
    </div>
  );
};
