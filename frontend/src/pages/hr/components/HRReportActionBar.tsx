import React from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileSpreadsheet, Calendar, Clock, Wallet } from "lucide-react";
import { toneOutlineClass } from "@/components/ui/tone";
import type { TeamLeaderOption } from "@/hooks/useHRReportManagement";

interface HRReportActionBarProps {
  exportDialogOpen: boolean;
  onExportDialogOpenChange: (open: boolean) => void;
  exportType: "ot-standby" | "leave" | "payroll";
  onExportTypeChange: (v: "ot-standby" | "leave" | "payroll") => void;
  exportStatus: "approved" | "pending";
  onExportStatusChange: (v: "approved" | "pending") => void;
  exportLoading: boolean;
  onExport: () => void;
  start: string;
  end: string;
  selectedItalianTL: string;
  selectedAlbanianTL: string;
  selectedWorkspace: string;
  italianTLs?: TeamLeaderOption[];
  albanianTLs?: TeamLeaderOption[];
}

const getTLName = (id: string, tlList?: TeamLeaderOption[]) => {
  if (id === "all") return "All";
  if (id === "none") return "None (No Filter)";
  const tl = tlList?.find((t) => String(t.id) === id);
  return tl ? tl.full_name : id;
};

export const HRReportActionBar: React.FC<HRReportActionBarProps> = ({
  exportDialogOpen,
  onExportDialogOpenChange,
  exportType,
  onExportTypeChange,
  exportStatus,
  onExportStatusChange,
  exportLoading,
  onExport,
  start,
  end,
  selectedItalianTL,
  selectedAlbanianTL,
  selectedWorkspace,
  italianTLs,
  albanianTLs,
}) => {
  const openExport = (type: "ot-standby" | "leave" | "payroll", status: "approved" | "pending") => {
    onExportTypeChange(type);
    onExportStatusChange(status);
    onExportDialogOpenChange(true);
  };

  const dialogTitle =
    exportType === "leave"
      ? "Export Leave"
      : exportType === "payroll"
        ? "Export by Payroll Period"
        : exportStatus === "pending"
          ? "Export Pending (by Work Date)"
          : "Export by Work Date";

  const dialogDescription =
    exportType === "leave"
      ? "Leave records with per-Italian TL sheet separation."
      : exportType === "payroll"
        ? "Approved OT & Standby filtered by processing period (not work date). Includes carryover entries and processing-period columns. Use this for HR-to-Payroll reconciliation."
        : exportStatus === "pending"
          ? "Pending Overtime and Standby records with per-Italian TL sheet separation."
          : "Approved Overtime and Standby records with per-Italian TL sheet separation.";

  return (
    <GlassCard isHoverLift={false} className="flex flex-col justify-center gap-1.5 p-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => openExport("ot-standby", "approved")}
        className="w-full justify-start gap-2 border-primary/50 text-foreground hover:bg-primary/10"
      >
        <FileSpreadsheet className="h-4 w-4" /> Export by Work Date
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => openExport("payroll", "approved")}
        className={`w-full justify-start gap-2 ${toneOutlineClass.accent}`}
      >
        <Wallet className="h-4 w-4" /> Export by Payroll Period
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => openExport("ot-standby", "pending")}
        className={`w-full justify-start gap-2 ${toneOutlineClass.warning}`}
      >
        <Clock className="h-4 w-4" /> Export Pending (by Work Date)
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => openExport("leave", "approved")}
        className={`w-full justify-start gap-2 ${toneOutlineClass.success}`}
      >
        <Calendar className="h-4 w-4" /> Export Leave
      </Button>

      <Dialog open={exportDialogOpen} onOpenChange={onExportDialogOpenChange}>
        <DialogContent>
          <DialogHeader className="shrink-0">
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-4">
            <div className="text-sm text-muted-foreground">
              Using current filter settings:
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>
                  Date range: {start || "All"} to {end || "All"}
                </li>
                {exportType === "ot-standby" && (
                  <li>Status: {exportStatus === "pending" ? "Pending only" : "Approved only"}</li>
                )}
                {exportType === "payroll" && (
                  <li>Mode: Processing period (carryover-aware, approved only)</li>
                )}
                <li>Italian TL: {getTLName(selectedItalianTL, italianTLs)}</li>
                <li>Albanian TL: {getTLName(selectedAlbanianTL, albanianTLs)}</li>
                <li>Workspace: {selectedWorkspace === "all" ? "All" : selectedWorkspace}</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => onExportDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onExport} disabled={exportLoading}>
              {exportLoading ? "Exporting..." : "Export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GlassCard>
  );
};
