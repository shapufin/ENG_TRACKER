import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Label } from "@/components/ui/label";
import { RowActions } from "@/components/ui/RowActions";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadBlobResponse } from "@/lib/download";
import { handleApiError } from "@/lib/error-handler";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { yearCloseService } from "../services/yearCloseService";
import type { LeaderHistoryRow } from "../types/yearClose";

interface LeaderHistoryTabProps {
  years: number[];
}

/** Everything each current or former leader authored or was measured on in one year. */
export const LeaderHistoryTab: React.FC<LeaderHistoryTabProps> = ({ years }) => {
  const [year, setYear] = useState<number>(years[0]);

  const leaders = useQuery({
    queryKey: ["year_close", "leaders", year],
    queryFn: () => yearCloseService.listLeaderHistory(year),
    enabled: years.length > 0,
  });

  const columns = useMemo<AppColumnDef<LeaderHistoryRow>[]>(
    () => [
      { id: "name", accessorKey: "name", header: "Leader", size: 180 },
      {
        id: "is_current",
        accessorKey: "is_current",
        header: "Status",
        size: 110,
        cell: ({ row }) => (
          <StatusBadge
            variant={row.original.is_current ? "approved" : "cancelled"}
            label={row.original.is_current ? "Current" : "Former"}
            isCompact
            isShowIcon={false}
          />
        ),
      },
      {
        id: "scorecard_months",
        accessorKey: "scorecard_months",
        header: "Scorecard months",
        size: 130,
      },
      {
        id: "engagement_months",
        accessorKey: "engagement_months",
        header: "Engagement months",
        size: 140,
      },
      {
        id: "governance_evidence",
        accessorKey: "governance_evidence",
        header: "HBPR evidence",
        size: 120,
      },
      { id: "leader_records", accessorKey: "leader_records", header: "Records", size: 100 },
      {
        id: "actions",
        header: "Actions",
        size: 90,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                label: `Export ${row.original.name} ${year}`,
                icon: FileSpreadsheet,
                onClick: async () => {
                  try {
                    const blob = await yearCloseService.exportLeader(year, row.original.leader_id);
                    downloadBlobResponse(blob, `${row.original.username}-${year}.xlsx`);
                  } catch (error) {
                    handleApiError(error);
                  }
                },
              },
            ]}
          />
        ),
      },
    ],
    [year]
  );

  if (years.length === 0) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="No closed years yet"
        description="Leader history appears once a year is closed."
      />
    );
  }

  return (
    <GlassCard delay={0} className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="archive-leader-year" className="text-xs">
          Year
        </Label>
        <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
          <SelectTrigger id="archive-leader-year" className="w-28" controlSize="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {leaders.isError ? (
        <ErrorCard onRetry={() => leaders.refetch()} />
      ) : (
        <DataTable columns={columns} data={leaders.data ?? []} />
      )}
    </GlassCard>
  );
};
