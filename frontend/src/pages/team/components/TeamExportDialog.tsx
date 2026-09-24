import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadBlobResponse } from "@/lib/download";
import { toLocalISODate } from "@/lib/date-format-utils";
import { extractApiErrorMessage } from "@/lib/apiFormError";
import { reportService } from "@/services/reportService";

interface TeamExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportType = "ot-standby" | "leave";
type ExportStatus = "approved" | "pending";

/** TL-scoped export — no team/TL selector, unlike the HR export dialog:
 * the backend already scopes to the caller's own team via
 * `apply_visibility_constraints` (apps/reports/filters.py), so every row
 * returned here already belongs to a team this TL leads or is part of. */
export const TeamExportDialog: React.FC<TeamExportDialogProps> = ({ open, onOpenChange }) => {
  const [exportType, setExportType] = useState<ExportType>("ot-standby");
  const [status, setStatus] = useState<ExportStatus>("approved");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = { start_date: start || undefined, end_date: end || undefined };
      const blob =
        exportType === "leave"
          ? await reportService.exportLeave(params)
          : await reportService.exportOTStandby({ ...params, status });

      const date = toLocalISODate(new Date());
      const typeLabel =
        exportType === "leave" ? "leave" : status === "pending" ? "ot_standby_pending" : "ot_standby";
      downloadBlobResponse(blob, `team_${typeLabel}_export_${date}.xlsx`);
      onOpenChange(false);
    } catch (error) {
      toast.error(extractApiErrorMessage(error, "Could not generate export."));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Export Team Records</DialogTitle>
          <DialogDescription>
            Exports records for your own team{"'"}s members only, as an Excel file.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="team-export-type">Records</Label>
            <Select value={exportType} onValueChange={(v) => setExportType(v as ExportType)}>
              <SelectTrigger id="team-export-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ot-standby">Overtime &amp; Standby</SelectItem>
                <SelectItem value="leave">Leave</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {exportType === "ot-standby" && (
            <div className="space-y-1.5">
              <Label htmlFor="team-export-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ExportStatus)}>
                <SelectTrigger id="team-export-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approved only</SelectItem>
                  <SelectItem value="pending">Pending only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Date range</Label>
            <DateRangePicker
              id="team-export-date-range"
              from={start}
              to={end}
              onChange={({ from, to }) => {
                setStart(from);
                setEnd(to);
              }}
              placeholder="All dates"
              ariaLabel="Export date range"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? "Exporting..." : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
