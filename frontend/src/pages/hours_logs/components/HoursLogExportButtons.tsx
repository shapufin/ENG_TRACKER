import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { exportData } from "@/utils/exportUtils";

interface HoursLogExportButtonsProps<T extends object> {
  logs: T[];
  filename: string;
  /** When provided, JSON export fetches the full dataset first (bypassing UI pagination). */
  onFetchAll?: () => Promise<T[]>;
  /** Server-side CSV download: the file's columns and row order are decided by the API. */
  onExportCsv: () => Promise<void>;
}

export const HoursLogExportButtons = <T extends object>({
  logs,
  filename,
  onFetchAll,
  onExportCsv,
}: HoursLogExportButtonsProps<T>) => {
  const [isExporting, setIsExporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      await onExportCsv();
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

  const runFromMenu = (run: () => Promise<void>) => () => {
    setMenuOpen(false);
    void run();
  };

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="control" className="md:hidden" disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-40 space-y-1 p-2">
          <Button
            variant="ghost"
            size="control"
            className="w-full justify-start"
            onClick={runFromMenu(handleExportCsv)}
          >
            CSV
          </Button>
          <Button
            variant="ghost"
            size="control"
            className="w-full justify-start"
            onClick={runFromMenu(handleExportJson)}
          >
            JSON
          </Button>
        </PopoverContent>
      </Popover>
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
