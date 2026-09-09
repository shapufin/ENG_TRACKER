import React from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
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

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Generate Weekly Standby (7 days)"
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      size="lg"
    >
      <div className="space-y-4">
        {isAdmin && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              User (optional - defaults to self)
            </Label>
            <Select value={weeklyForm.user} onValueChange={(v) => onPatchWeeklyForm({ user: v })}>
              <SelectTrigger className="h-10 px-3">
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
            <Input
              type="time"
              value={weeklyForm.start_time}
              onChange={(e) => onPatchWeeklyForm({ start_time: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Weekday End Time (next day)</Label>
            <Input
              type="time"
              value={weeklyForm.end_time}
              onChange={(e) => onPatchWeeklyForm({ end_time: e.target.value })}
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
          <div className="max-h-32 space-y-2 overflow-y-auto rounded-md border p-2">
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
              <p className="text-xs text-muted-foreground">No clients available.</p>
            )}
          </div>
        </div>
        {weeklyPreview.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <div className="bg-muted px-3 py-2 text-sm font-medium">
              Preview ({weeklyPreview.length} days) - Click cells to edit
            </div>
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-40" />
                <col className="w-28" />
                <col className="w-28" />
                <col className="w-20" />
                <col className="w-8" />
              </colgroup>
              <thead className="bg-muted/90 backdrop-blur-sm">
                <tr>
                  <th className="px-3 py-1 text-left">Date</th>
                  <th className="px-3 py-1 text-left">Start</th>
                  <th className="px-3 py-1 text-left">End</th>
                  <th className="px-3 py-1 text-left">Hours</th>
                  <th className="px-3 py-1 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {weeklyPreview.map((day, idx) => (
                  <tr key={idx} className={`border-t ${day.isWeekend ? "bg-warning/10" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-1">
                      {formatDateDDMMYYYY(day.date)}
                      {day.isWeekend && (
                        <span className="ml-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                          (weekend)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1">
                      <Input
                        type="time"
                        value={day.start}
                        onChange={(e) => onUpdatePreviewRow(idx, "start", e.target.value)}
                        className="h-7 w-full min-w-0 px-1 py-0 text-xs"
                      />
                    </td>
                    <td className="px-3 py-1">
                      <Input
                        type="time"
                        value={day.end}
                        onChange={(e) => onUpdatePreviewRow(idx, "end", e.target.value)}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </FormDialog>
  );
};
