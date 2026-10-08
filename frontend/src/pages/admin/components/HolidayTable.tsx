/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { createEditDeleteActionsColumn } from "@/components/ui/tableColumnHelpers";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { CalendarDays } from "lucide-react";
import type { PublicHoliday } from "@/types";

interface HolidayRow {
  id: number;
  name: string;
  formattedDate: string;
  country_code?: string;
  is_global: boolean;
  scope: string;
}

interface HolidayTableProps {
  holidays: HolidayRow[];
  isLoading: boolean;
  onEdit: (holiday: PublicHoliday) => void;
  onDelete: (holiday: PublicHoliday) => void;
}

export const HolidayTable: React.FC<HolidayTableProps> = ({
  holidays,
  isLoading,
  onEdit,
  onDelete,
}) => {
  const columns = useMemo<AppColumnDef<HolidayRow>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: "date",
        accessorKey: "formattedDate",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">{row.original.formattedDate}</span>
        ),
      },
      {
        id: "country",
        accessorKey: "country_code",
        header: "Country",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm tracking-wide uppercase">
            {row.original.country_code || "—"}
          </span>
        ),
      },
      {
        id: "scope",
        header: "Scope",
        cell: ({ row }) => (
          <Badge variant={row.original.is_global ? "secondary" : "outline"}>
            {row.original.scope}
          </Badge>
        ),
      },
      createEditDeleteActionsColumn<HolidayRow>(
        (row) => onEdit(row as any),
        (row) => onDelete(row as any)
      ),
    ],
    [onEdit, onDelete]
  );

  if (isLoading) {
    return <LoadingCard rows={4} className="min-h-[200px]" />;
  }

  if (holidays.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No holidays defined yet."
        description="Add the first company holiday to get started."
      />
    );
  }

  return (
    <GlassCard className="p-4">
      <DataTable columns={columns} data={holidays} emptyMessage="No holidays defined yet." />
    </GlassCard>
  );
};
