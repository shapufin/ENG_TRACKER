import React, { useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimeHoursGrid } from "@/components/ui/TimeHoursGrid";
import { UserSelectField } from "@/components/common/forms/UserSelectField";
import { useFormFieldUpdater } from "@/components/common/forms/useFormFieldUpdater";
import { usePlugins } from "@/context/PluginContext";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { getPluginComponent } from "@/plugins";
import type { OvertimeLog } from "@/types";

interface OvertimeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  editingLog?: OvertimeLog | null;
  isAdmin: boolean;
  form: {
    user: string;
    client: string;
    date: string;
    start_time: string;
    end_time: string;
    hours: string;
    description: string;
    evidence_type: "ticket" | "email" | "call" | "other";
    evidence: string;
    ticket_references: string[];
  };
  formErrors: { client?: string; date?: string; start_time?: string; end_time?: string };
  users?: { id: number; full_name?: string; username?: string }[];
  clients?: { id: number; name: string }[];
  previewHours: number | null;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onFormChange: (form: {
    user: string;
    client: string;
    date: string;
    start_time: string;
    end_time: string;
    hours: string;
    description: string;
    evidence_type: "ticket" | "email" | "call" | "other";
    evidence: string;
    ticket_references: string[];
  }) => void;
  onFormErrorsChange: (errors: {
    client?: string;
    date?: string;
    start_time?: string;
    end_time?: string;
  }) => void;
}

// fallow-ignore-next-line complexity
export const OvertimeFormDialog: React.FC<OvertimeFormDialogProps> = ({
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
  editingLog,
}) => {
  const updateField = useFormFieldUpdater(form, formErrors, onFormChange, onFormErrorsChange);
  const [ticketDraft, setTicketDraft] = useState("");
  const addTicketReference = () => {
    const value = ticketDraft.trim();
    if (!value || form.ticket_references.length >= 20) return;
    const normalizeReference = (ref: string) =>
      ref
        .trim()
        .toLowerCase()
        .replace(/^(inc|ticket|t|#)\s*-?\s*/, "")
        .replace(/\s+/g, "");
    const normalized = normalizeReference(value);
    if (form.ticket_references.some((ref) => normalizeReference(ref) === normalized)) {
      setTicketDraft("");
      return;
    }
    updateField("ticket_references", [...form.ticket_references, value]);
    setTicketDraft("");
  };
  const { activePlugins } = usePlugins();
  const { canManage } = usePluginPermissions();
  const TicketLinkSection = getPluginComponent(
    "ticket_kpi",
    "TicketLinkSection"
  ) as React.ComponentType<{ overtimeLogId: number }> | null;
  const showTicketLinks =
    editing &&
    !!editingLog?.id &&
    activePlugins.some((plugin) => plugin.name === "ticket_kpi") &&
    canManage("ticket_kpi") &&
    !!TicketLinkSection;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit Overtime" : "New Overtime"}
      description="Record the overtime hours and supporting details."
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
    >
      <div className="grid grid-cols-2 gap-4">
        {!editing && isAdmin && (
          <UserSelectField
            value={form.user}
            users={users}
            onChange={(value) => updateField("user", value)}
          />
        )}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Client
          </Label>
          <Select value={form.client} onValueChange={(v) => updateField("client", v)}>
            <SelectTrigger className={`h-10 px-3 ${formErrors.client ? "border-destructive" : ""}`}>
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {clients?.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {formErrors.client && <p className="text-xs text-destructive">{formErrors.client}</p>}
        </div>
        <div className="space-y-2">
          <Label>Date (DD/MM/YYYY)</Label>
          <DatePicker
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
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Evidence type
        </Label>
        <Select
          value={form.evidence_type}
          onValueChange={(v) =>
            updateField("evidence_type", v as "ticket" | "email" | "call" | "other")
          }
        >
          <SelectTrigger className="h-10 px-3">
            <SelectValue placeholder="Select evidence type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ticket">Ticket</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="call">Call</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.evidence_type === "ticket" && (
        <div className="space-y-2">
          <Label>Ticket references</Label>
          <div className="flex gap-2">
            <Input
              value={ticketDraft}
              onChange={(event) => setTicketDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTicketReference();
                }
              }}
              placeholder="Add ticket ID"
              aria-label="Add structured ticket reference"
            />
            <Button type="button" variant="outline" onClick={addTicketReference}>
              Add
            </Button>
          </div>
          {form.ticket_references.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Structured ticket references">
              {form.ticket_references.map((reference, index) => (
                <Button
                  key={`${reference}-${index}`}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    updateField(
                      "ticket_references",
                      form.ticket_references.filter((_, i) => i !== index)
                    )
                  }
                >
                  {reference} ×
                </Button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Up to 20 references. Click a reference to remove it.
          </p>
        </div>
      )}
      {form.evidence_type !== "ticket" && (
        <div className="space-y-2">
          <Label>Reference / Evidence</Label>
          <Input
            value={form.evidence}
            onChange={(e) => updateField("evidence", e.target.value)}
            placeholder="Email reference, call log, etc."
          />
        </div>
      )}
      {showTicketLinks && TicketLinkSection && editingLog?.id && (
        <TicketLinkSection overtimeLogId={editingLog.id} />
      )}
      <div className="space-y-2">
        <Label>Description</Label>
        <Input
          value={form.description}
          onChange={(e) => updateField("description", e.target.value)}
        />
      </div>
    </FormDialog>
  );
};
