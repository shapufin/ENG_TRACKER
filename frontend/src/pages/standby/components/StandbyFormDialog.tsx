import React from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimeHoursGrid } from "@/components/ui/TimeHoursGrid";
import { UserSelectField } from "@/components/common/forms/UserSelectField";
import { useFormFieldUpdater } from "@/components/common/forms/useFormFieldUpdater";
import { Checkbox } from "@/components/ui/checkbox";

interface StandbyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  isAdmin: boolean;
  form: {
    user: string;
    date: string;
    start_time: string;
    end_time: string;
    hours: string;
    description: string;
    client_ids: number[];
  };
  formErrors: { date?: string; start_time?: string; end_time?: string };
  users?: { id: number; full_name?: string; username?: string }[];
  clients?: { id: number; name: string }[];
  previewHours: number | null;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onFormChange: (form: {
    user: string;
    date: string;
    start_time: string;
    end_time: string;
    hours: string;
    description: string;
    client_ids: number[];
  }) => void;
  onFormErrorsChange: (errors: { date?: string; start_time?: string; end_time?: string }) => void;
}

export const StandbyFormDialog: React.FC<StandbyFormDialogProps> = ({
  open,
  onOpenChange,
  editing,
  isAdmin,
  form,
  formErrors,
  users,
  clients,
  previewHours,
  isSubmitting,
  onSubmit,
  onFormChange,
  onFormErrorsChange,
}) => {
  const updateField = useFormFieldUpdater(form, formErrors, onFormChange, onFormErrorsChange);

  const toggleClient = (clientId: number) => {
    const current = form.client_ids || [];
    const next = current.includes(clientId)
      ? current.filter((id) => id !== clientId)
      : [...current, clientId];
    onFormChange({ ...form, client_ids: next });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit Standby" : "New Standby"}
      description="Record standby coverage and its schedule."
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
    >
      {!editing && isAdmin && (
        <UserSelectField
          value={form.user}
          users={users}
          onChange={(value) => updateField("user", value)}
        />
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="standby-date">Date (DD/MM/YYYY)</Label>
          <DatePicker
            id="standby-date"
            value={form.date}
            onChange={(v) => updateField("date", v)}
            placeholder="DD/MM/YYYY"
          />
          {formErrors.date && <p className="text-xs text-destructive">{formErrors.date}</p>}
        </div>
      </div>
      <TimeHoursGrid
        startTime={form.start_time}
        endTime={form.end_time}
        hours={form.hours}
        previewHours={previewHours}
        startTimeError={formErrors.start_time}
        endTimeError={formErrors.end_time}
        onStartTimeChange={(v) => updateField("start_time", v)}
        onEndTimeChange={(v) => updateField("end_time", v)}
      />
      <div className="space-y-2">
        <Label>Clients (optional — select all clients covered by this standby)</Label>
        <div className="max-h-32 space-y-2 overflow-y-auto rounded-md border p-2">
          {clients?.length ? (
            clients.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Checkbox
                  id={`standby-client-${c.id}`}
                  checked={form.client_ids?.includes(c.id) ?? false}
                  onCheckedChange={() => toggleClient(c.id)}
                />
                <Label htmlFor={`standby-client-${c.id}`} className="text-sm">
                  {c.name}
                </Label>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No clients available.</p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="standby-description">Description</Label>
        <Input
          id="standby-description"
          value={form.description}
          onChange={(e) => updateField("description", e.target.value)}
        />
      </div>
    </FormDialog>
  );
};
