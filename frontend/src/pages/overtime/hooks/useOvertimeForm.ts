import { useState } from "react";
import type { OvertimeLog } from "@/types";
import { calculateHours, validateTimeRange } from "@/lib/time-utils";

type OvertimeFormErrors = {
  client?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
};

const DEFAULT_FORM = {
  user: "",
  client: "",
  date: "",
  start_time: "",
  end_time: "",
  hours: "",
  description: "",
  evidence_type: "other" as "ticket" | "email" | "call" | "other",
  evidence: "",
  ticket_references: [] as string[],
};

export const useOvertimeForm = () => {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OvertimeLog | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [formErrors, setFormErrors] = useState<OvertimeFormErrors>({});

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setFormErrors({});
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setFormOpen(true);
  };

  // fallow-ignore-next-line complexity
  const openEdit = (log: OvertimeLog) => {
    setEditing(log);
    setForm({
      user: String(log.user),
      client: String(log.client),
      date: log.date,
      start_time: log.start_time?.slice(0, 5) || "",
      end_time: log.end_time?.slice(0, 5) || "",
      hours: String(log.hours),
      description: log.description || "",
      evidence_type: log.evidence_type || "other",
      evidence: log.evidence || "",
      ticket_references: log.ticket_references || [],
    });
    setFormOpen(true);
  };

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key in formErrors) setFormErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validateForm = (): boolean => {
    const errors: OvertimeFormErrors = {};
    if (!form.client) errors.client = "Client is required";
    if (!form.date) errors.date = "Date is required";
    if (!form.start_time) errors.start_time = "Start time is required";
    if (!form.end_time) errors.end_time = "End time is required";
    else {
      const rangeError = validateTimeRange(form.start_time, form.end_time);
      if (rangeError) errors.end_time = rangeError;
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const previewHours =
    form.start_time && form.end_time ? calculateHours(form.start_time, form.end_time) : null;

  const buildPayload = (): Record<string, unknown> => ({
    client: Number(form.client),
    date: form.date,
    description: form.description,
    evidence_type: form.evidence_type,
    evidence: form.evidence,
    ticket_references: form.ticket_references,
    start_time: form.start_time,
    end_time: form.end_time,
  });

  return {
    formOpen,
    setFormOpen,
    editing,
    setEditing,
    form,
    setForm,
    formErrors,
    setFormErrors,
    resetForm,
    openCreate,
    openEdit,
    updateField,
    validateForm,
    previewHours,
    buildPayload,
  };
};
