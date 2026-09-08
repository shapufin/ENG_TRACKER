// fallow-ignore-file unused-file
import React from "react";
import { HoursLogsTable } from "./HoursLogsTable";
import type { OvertimeLog } from "@/types";

interface OvertimeLogsTableProps {
  logs: OvertimeLog[];
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}

export const OvertimeLogsTable: React.FC<OvertimeLogsTableProps> = ({
  logs,
  onApprove,
  onReject,
}) => (
  <HoursLogsTable<OvertimeLog>
    logs={logs}
    onApprove={onApprove}
    onReject={onReject}
    storageKey="table-visibility-overtime-logs"
  />
);
