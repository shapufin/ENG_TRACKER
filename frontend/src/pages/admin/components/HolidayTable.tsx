/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { Pencil, Trash2 } from "lucide-react";
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
  if (isLoading) {
    return <LoadingCard rows={4} className="min-h-[200px]" />;
  }

  if (holidays.length === 0) {
    return (
      <GlassCard isHoverLift={false} className="p-6 text-center text-sm text-muted-foreground">
        No holidays defined yet.
      </GlassCard>
    );
  }

  return (
    <GlassCard isHoverLift={false} className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border/50">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-6 py-4 text-left">Name</th>
              <th className="px-6 py-4 text-left">Date</th>
              <th className="px-6 py-4 text-left">Country</th>
              <th className="px-6 py-4 text-left">Scope</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {holidays.map((holiday) => (
              <tr key={holiday.id}>
                <td className="px-6 py-4 font-medium">{holiday.name}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{holiday.formattedDate}</td>
                <td className="px-6 py-4 text-sm uppercase tracking-wide text-muted-foreground">
                  {holiday.country_code || "—"}
                </td>
                <td className="px-6 py-4">
                  <Badge variant={holiday.is_global ? "secondary" : "outline"}>
                    {holiday.scope}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(holiday as any)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive/80"
                      onClick={() => onDelete(holiday as any)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
};
