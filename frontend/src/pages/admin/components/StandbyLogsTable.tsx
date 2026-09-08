// fallow-ignore-file unused-file
import React from "react";
import { HoursLogsTable } from "./HoursLogsTable";
import { timeRangeColumn } from "./standbyColumns";
import type { StandbyLog } from "@/types";

interface StandbyLogsTableProps {
  logs: StandbyLog[];
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}

export const StandbyLogsTable: React.FC<StandbyLogsTableProps> = ({
  logs,
  onApprove,
  onReject,
}) => (
  <HoursLogsTable<StandbyLog>
    logs={logs}
    extraColumns={[timeRangeColumn]}
    onApprove={onApprove}
    onReject={onReject}
    storageKey="table-visibility-standby-logs"
  />
);
