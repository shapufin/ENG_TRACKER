import React from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SwitchField } from "@/components/common/forms/SwitchField";
import { ModalSection } from "@/components/ui/ModalSection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface HolidayFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingName?: string | null;
  form: {
    name: string;
    date: string;
    country_code: string;
    is_global: boolean;
    description: string;
    calendar: string;
  };
  onFormChange: (form: {
    name: string;
    date: string;
    country_code: string;
    is_global: boolean;
    description: string;
    calendar: string;
  }) => void;
  workspaceOptions: { id: number; name: string }[];
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export const HolidayFormDialog: React.FC<HolidayFormDialogProps> = ({
  open,
  onOpenChange,
  editingName,
  form,
  onFormChange,
  workspaceOptions,
  isSubmitting,
  onSubmit,
}) => {
  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    onFormChange({ ...form, [key]: value });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingName ? `Edit ${editingName}` : "Add Holiday"}
      description="Holidays block leave booking and appear on team calendars."
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
    >
      <ModalSection columns={2}>
        <div className="space-y-1">
          <Label htmlFor="holiday-name">Name</Label>
          <Input
            id="holiday-name"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="holiday-date">Date</Label>
          <Input
            id="holiday-date"
            type="date"
            value={form.date}
            onChange={(e) => updateField("date", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="holiday-country">Country Code</Label>
          <Input
            id="holiday-country"
            value={form.country_code}
            onChange={(e) => updateField("country_code", e.target.value.toUpperCase())}
            maxLength={2}
            placeholder="e.g. US"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="holiday-description">Description</Label>
          <Input
            id="holiday-description"
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="Optional details"
          />
        </div>
        <div className="sm:col-span-2">
          <SwitchField
            id="holiday-global"
            label="Applies to all workspaces"
            description="Global holidays apply to every calendar workspace."
            checked={form.is_global}
            onCheckedChange={(checked) => updateField("is_global", checked)}
          />
        </div>
        {!form.is_global && (
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="holiday-workspace">Workspace</Label>
            <Select value={form.calendar} onValueChange={(value) => updateField("calendar", value)}>
              <SelectTrigger id="holiday-workspace">
                <SelectValue placeholder="Select workspace" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">All Workspaces</SelectItem>
                {workspaceOptions.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </ModalSection>
    </FormDialog>
  );
};
