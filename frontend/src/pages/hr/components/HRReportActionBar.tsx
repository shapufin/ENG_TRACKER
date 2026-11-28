import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileSpreadsheet, Calendar, Clock, Wallet, Download, ChevronDown } from "lucide-react";
import { toneTextClass } from "@/components/ui/tone";
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
  selectedTeam?: string;
  selectedWorkspace: string;
  teams?: { id: number; name: string }[];
  workspaces?: { id: number; name: string }[];
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
  selectedTeam = "all",
  selectedWorkspace,
  teams,
  workspaces,
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
      ? "Leave records with per-Manager sheet separation."
      : exportType === "payroll"
        ? "Approved OT & Standby filtered by processing period (not work date). Includes carryover entries and processing-period columns. Use this for HR-to-Payroll reconciliation."
        : exportStatus === "pending"
          ? "Pending Overtime and Standby records with per-Manager sheet separation."
          : "Approved Overtime and Standby records with per-Manager sheet separation.";

  const workspaceName =
    selectedWorkspace === "all"
      ? "All"
      : (workspaces?.find((w) => String(w.id) === selectedWorkspace)?.name ?? selectedWorkspace);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="control" className="gap-2">
            <Download className="h-4 w-4" aria-hidden="true" />
            Export
            <ChevronDown className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
            Export Excel (.xlsx)
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => openExport("ot-standby", "approved")}
            className="flex items-start gap-2.5 py-2"
          >
            <FileSpreadsheet className="text-primary mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium">Export by Work Date</div>
              <div className="text-muted-foreground text-xs">Approved OT &amp; Standby</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => openExport("payroll", "approved")}
            className="flex items-start gap-2.5 py-2"
          >
            <Wallet className={`${toneTextClass.accent} mt-0.5 h-4 w-4 shrink-0`} />
            <div className="min-w-0">
              <div className="text-sm font-medium">Export by Payroll Period</div>
              <div className="text-muted-foreground text-xs">Carryover-aware reconciliation</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => openExport("ot-standby", "pending")}
            className="flex items-start gap-2.5 py-2"
          >
            <Clock className={`${toneTextClass.warning} mt-0.5 h-4 w-4 shrink-0`} />
            <div className="min-w-0">
              <div className="text-sm font-medium">Export Pending (by Work Date)</div>
              <div className="text-muted-foreground text-xs">Awaiting approval only</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => openExport("leave", "approved")}
            className="flex items-start gap-2.5 py-2"
          >
            <Calendar className={`${toneTextClass.success} mt-0.5 h-4 w-4 shrink-0`} />
            <div className="min-w-0">
              <div className="text-sm font-medium">Export Leave</div>
              <div className="text-muted-foreground text-xs">Approved absences</div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={exportDialogOpen} onOpenChange={onExportDialogOpenChange}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="text-muted-foreground text-sm">
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
                <li>Manager: {getTLName(selectedItalianTL, italianTLs)}</li>
                <li>Line Manager: {getTLName(selectedAlbanianTL, albanianTLs)}</li>
                <li>
                  Team:{" "}
                  {selectedTeam === "all"
                    ? "All"
                    : (teams?.find((t) => String(t.id) === selectedTeam)?.name ?? selectedTeam)}
                </li>
                <li>Workspace: {workspaceName}</li>
              </ul>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onExportDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onExport} disabled={exportLoading}>
              {exportLoading ? "Exporting..." : "Export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
