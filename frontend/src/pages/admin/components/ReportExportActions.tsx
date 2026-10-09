import React from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";

interface ReportExportActionsProps {
  activeTab: "overtime_standby" | "vacation";
  onExportOvertime: () => void;
  onExportStandby: () => void;
  onExportLeave: () => void;
}

export const ReportExportActions: React.FC<ReportExportActionsProps> = ({
  activeTab,
  onExportOvertime,
  onExportStandby,
  onExportLeave,
}) => {
  return (
    <div className="flex flex-wrap gap-2">
      {activeTab === "overtime_standby" ? (
        <>
          <Button variant="outline" size="sm" onClick={onExportOvertime}>
            <FileSpreadsheet className="text-muted-foreground mr-2 h-4 w-4" /> Export OT
          </Button>
          <Button variant="outline" size="sm" onClick={onExportStandby}>
            <FileSpreadsheet className="text-muted-foreground mr-2 h-4 w-4" /> Export Standby
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={onExportLeave}>
          <FileSpreadsheet className="text-muted-foreground mr-2 h-4 w-4" /> Export Vacations
        </Button>
      )}
    </div>
  );
};
