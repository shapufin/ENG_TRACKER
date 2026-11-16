import React from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { TimeInput } from "@/components/ui/TimeInput";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { SwitchField } from "@/components/common/forms/SwitchField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/DatePicker";
import { X } from "lucide-react";
import { TABLE_HEAD_CELL_CLASS, TABLE_HEAD_ROW_CLASS } from "@/components/ui/tableStyles";
import { cn } from "@/lib/utils";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";

interface WeeklyPreviewEntry {
  date: string;
  start: string;
  end: string;
  hours: number;
  isWeekend: boolean;
  isEdited: boolean;
}

interface WeeklyGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weeklyForm: {
    start_date: string;
    start_time: string;
    end_time: string;
    weekend_24h: boolean;
    user: string;
    description: string;
    client_ids: number[];
  };
  weeklyPreview: WeeklyPreviewEntry[];
  users?: { id: number; full_name?: string; username?: string }[];
  clients?: { id: number; name: string }[];
  isAdmin: boolean;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onPatchWeeklyForm: (
    patch: Partial<{
      start_date: string;
      start_time: string;
      end_time: string;
      weekend_24h: boolean;
      user: string;
      description: string;
      client_ids: number[];
    }>
  ) => void;
  onUpdatePreviewRow: (
    index: number,
    field: "start" | "end" | "hours",
    value: string | number
  ) => void;
  onResetPreviewRow: (index: number) => void;
}

export const WeeklyGeneratorDialog: React.FC<WeeklyGeneratorDialogProps> = ({
  open,
  onOpenChange,
  weeklyForm,
  weeklyPreview,
  users,
  clients,
  isAdmin,
  isSubmitting,
  onSubmit,
  onPatchWeeklyForm,
  onUpdatePreviewRow,
  onResetPreviewRow,
}) => {
  const toggleClient = (clientId: number) => {
    const current = weeklyForm.client_ids || [];
    const next = current.includes(clientId)
      ? current.filter((id) => id !== clientId)
      : [...current, clientId];
    onPatchWeeklyForm({ client_ids: next });
  };

  // Several rows can share a date (a night is split at midnight): group them for
  // display, keeping each row's flat index for the edit and reset handlers.
  const dayGroups = weeklyPreview.reduce<
    {
      date: string;
      isWeekend: boolean;
      total: number;
      rows: { day: WeeklyPreviewEntry; idx: number }[];
    }[]
  >((groups, day, idx) => {
    const group = groups.at(-1);
    if (group && group.date === day.date) {
      group.rows.push({ day, idx });
      group.total += day.hours;
    } else {
      groups.push({
        date: day.date,
        isWeekend: day.isWeekend,
        total: day.hours,
        rows: [{ day, idx }],
      });
    }
    return groups;
  }, []);
  const totalHours = weeklyPreview.reduce((sum, day) => sum + day.hours, 0);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Generate Weekly Standby"
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      size="lg"
      mobileSheet
    >
      <div className="space-y-4">
        {isAdmin && (
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              User (optional - defaults to self)
            </Label>
            <Select value={weeklyForm.user} onValueChange={(v) => onPatchWeeklyForm({ user: v })}>
              <SelectTrigger className="px-3">
                <SelectValue placeholder="Self (current user)" />
              </SelectTrigger>
              <SelectContent>
                {users?.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.full_name || u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Start Date *</Label>
            <DatePicker
              value={weeklyForm.start_date}
              onChange={(v) => onPatchWeeklyForm({ start_date: v })}
              placeholder="DD/MM/YYYY"
            />
          </div>
          <div className="flex items-end">
            <SwitchField
              id="weekend-24h"
              label="Weekend 24h (Sat/Sun)"
              description="Full 24-hour entries for Saturday and Sunday."
              checked={weeklyForm.weekend_24h}
              onCheckedChange={(v) => onPatchWeeklyForm({ weekend_24h: v })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Weekday Start Time</Label>
            <TimeInput
              value={weeklyForm.start_time}
              onChange={(v) => onPatchWeeklyForm({ start_time: v })}
            />
          </div>
          <div className="space-y-2">
            <Label>Weekday End Time (next day)</Label>
            <TimeInput
              value={weeklyForm.end_time}
              onChange={(v) => onPatchWeeklyForm({ end_time: v })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Description (applied to all entries)</Label>
          <Input
            value={weeklyForm.description}
            onChange={(e) => onPatchWeeklyForm({ description: e.target.value })}
            placeholder="Weekly standby duty"
          />
        </div>
        <div className="space-y-2">
          <Label>Clients (optional — applied to all entries)</Label>
          <div className="no-scrollbar max-h-32 space-y-2 overflow-y-auto rounded-xl border p-2.5">
            {clients?.length ? (
              clients.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`client-${c.id}`}
                    checked={weeklyForm.client_ids?.includes(c.id) ?? false}
                    onCheckedChange={() => toggleClient(c.id)}
                  />
                  <Label htmlFor={`client-${c.id}`} className="cursor-pointer text-sm font-normal">
                    {c.name}
                  </Label>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-xs">No clients available.</p>
            )}
          </div>
        </div>
        {weeklyPreview.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <div className="bg-muted px-3 py-2 text-sm font-medium">
              Preview ({weeklyPreview.length} entries over {dayGroups.length} days, {totalHours}h
              total) - Click cells to edit. Each night is split at midnight.
            </div>
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-40" />
                <col className="w-28" />
                <col className="w-28" />
                <col className="w-20" />
                <col className="w-8" />
              </colgroup>
              <thead className={TABLE_HEAD_ROW_CLASS}>
                <tr>
                  <th className={cn(TABLE_HEAD_CELL_CLASS, "px-3 py-1")}>Date</th>
                  <th className={cn(TABLE_HEAD_CELL_CLASS, "px-3 py-1")}>Start</th>
                  <th className={cn(TABLE_HEAD_CELL_CLASS, "px-3 py-1")}>End</th>
                  <th className={cn(TABLE_HEAD_CELL_CLASS, "px-3 py-1")}>Hours</th>
                  <th className={cn(TABLE_HEAD_CELL_CLASS, "px-3 py-1")}></th>
                </tr>
              </thead>
              <tbody>
                {dayGroups.flatMap((group) => {
                  const split = group.rows.length > 1;
                  const weekendTag = group.isWeekend && (
                    <span className="text-tone-warning-text ml-1 text-xs font-medium">
                      (weekend)
                    </span>
                  );
                  const header = split && (
                    <tr
                      key={`${group.date}-head`}
                      className={cn("border-t", group.isWeekend && "bg-warning/10")}
                    >
                      <td className="px-3 py-1 font-medium whitespace-nowrap" colSpan={3}>
                        {formatDateDDMMYYYY(group.date)}
                        {weekendTag}
                      </td>
                      <td
                        className="text-muted-foreground px-3 py-1 text-xs whitespace-nowrap"
                        colSpan={2}
                      >
                        Day total {group.total}h
                      </td>
                    </tr>
                  );
                  const rows = group.rows.map(({ day, idx }) => (
                    <tr
                      key={idx}
                      className={cn(
                        !split && "border-t",
                        !split && day.isWeekend && "bg-warning/10"
                      )}
                    >
                      <td className="px-3 py-1 whitespace-nowrap">
                        {split ? (
                          <span className="sr-only">Segment of {formatDateDDMMYYYY(day.date)}</span>
                        ) : (
                          <>
                            {formatDateDDMMYYYY(day.date)}
                            {weekendTag}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-1">
                        <TimeInput
                          showPeriod={false}
                          value={day.start}
                          onChange={(v) => onUpdatePreviewRow(idx, "start", v)}
                          className="h-7 w-full min-w-0 px-1 py-0 text-xs"
                        />
                      </td>
                      <td className="px-3 py-1">
                        <TimeInput
                          showPeriod={false}
                          value={day.end}
                          onChange={(v) => onUpdatePreviewRow(idx, "end", v)}
                          className="h-7 w-full min-w-0 px-1 py-0 text-xs"
                        />
                      </td>
                      <td className="px-3 py-1 font-medium">
                        <Input
                          type="number"
                          value={day.hours}
                          onChange={(e) => onUpdatePreviewRow(idx, "hours", Number(e.target.value))}
                          className="h-7 w-full min-w-0 px-1 py-0 text-xs"
                        />
                      </td>
                      <td className="px-3 py-1">
                        {day.isEdited && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => onResetPreviewRow(idx)}
                            title="Reset to calculated value"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ));
                  return [header, ...rows];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </FormDialog>
  );
};
