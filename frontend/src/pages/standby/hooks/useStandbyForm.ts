import { useState, useCallback } from "react";
import type { StandbyLog } from "@/types";
import { calculateHours, validateTimeRange } from "@/lib/time-utils";
import { toLocalISODate, parseLocalDate } from "@/lib/date-format-utils";

type WeeklyFormState = {
  start_date: string;
  start_time: string;
  end_time: string;
  weekend_24h: boolean;
  user: string;
  description: string;
  client_ids: number[];
};
type WeeklyPreviewEntry = {
  date: string;
  start: string;
  end: string;
  hours: number;
  isWeekend: boolean;
  isEdited: boolean;
};
type StandbyFormErrors = { date?: string; start_time?: string; end_time?: string };

const createDefaultWeeklyForm = (): WeeklyFormState => ({
  start_date: "",
  start_time: "18:00",
  end_time: "09:00",
  weekend_24h: true,
  user: "",
  description: "",
  client_ids: [],
});

const buildWeeklyPreview = (form: WeeklyFormState): WeeklyPreviewEntry[] => {
  if (!form.start_date) return [];
  const start = parseLocalDate(form.start_date);
  const preview: WeeklyPreviewEntry[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dateStr = toLocalISODate(date);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (isWeekend && form.weekend_24h) {
      preview.push({
        date: dateStr,
        start: "00:00",
        end: "23:59",
        hours: 24,
        isWeekend,
        isEdited: false,
      });
    } else {
      const hours = calculateHours(form.start_time, form.end_time) ?? 0;
      preview.push({
        date: dateStr,
        start: form.start_time,
        end: form.end_time,
        hours,
        isWeekend,
        isEdited: false,
      });
    }
  }
  return preview;
};

const previewsEqual = (a: WeeklyPreviewEntry[], b: WeeklyPreviewEntry[]) => {
  if (a.length !== b.length) return false;
  // fallow-ignore-next-line complexity
  return a.every((entry, idx) => {
    const next = b[idx];
    return (
      entry.date === next.date &&
      entry.start === next.start &&
      entry.end === next.end &&
      entry.hours === next.hours &&
      entry.isWeekend === next.isWeekend &&
      entry.isEdited === next.isEdited
    );
  });
};

export const useStandbyForm = () => {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StandbyLog | null>(null);
  const [form, setForm] = useState({
    user: "",
    date: "",
    start_time: "",
    end_time: "",
    hours: "",
    description: "",
    client_ids: [] as number[],
  });
  const [formErrors, setFormErrors] = useState<StandbyFormErrors>({});

  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [weeklyForm, setWeeklyForm] = useState<WeeklyFormState>(createDefaultWeeklyForm);
  const [weeklyPreview, setWeeklyPreview] = useState<WeeklyPreviewEntry[]>([]);

  const syncWeeklyPreview = useCallback((nextForm: WeeklyFormState) => {
    if (!nextForm.start_date) {
      setWeeklyPreview((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const generated = buildWeeklyPreview(nextForm);
    setWeeklyPreview((prev) => (previewsEqual(prev, generated) ? prev : generated));
  }, []);

  const patchWeeklyForm = useCallback(
    (patch: Partial<WeeklyFormState>) => {
      setWeeklyForm((prev) => {
        const next = { ...prev, ...patch };
        syncWeeklyPreview(next);
        return next;
      });
    },
    [syncWeeklyPreview]
  );

  const resetForm = () => {
    setForm({
      user: "",
      date: "",
      start_time: "",
      end_time: "",
      hours: "",
      description: "",
      client_ids: [],
    });
    setFormErrors({});
  };
  const resetWeeklyForm = () => {
    setWeeklyForm(createDefaultWeeklyForm());
    setWeeklyPreview([]);
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setFormOpen(true);
  };
  const openEdit = (log: StandbyLog) => {
    setEditing(log);
    setForm({
      user: String(log.user),
      date: log.date,
      start_time: log.start_time?.slice(0, 5) || "",
      end_time: log.end_time?.slice(0, 5) || "",
      hours: String(log.hours),
      description: log.description || "",
      client_ids: log.client_ids || [],
    });
    setFormOpen(true);
  };

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key in formErrors) setFormErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validateForm = (): boolean => {
    const errors: StandbyFormErrors = {};
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
    date: form.date,
    description: form.description,
    start_time: form.start_time,
    end_time: form.end_time,
    client_ids: form.client_ids,
  });

  const updatePreviewRow = (
    index: number,
    field: "start" | "end" | "hours",
    value: string | number
  ) => {
    const updated = [...weeklyPreview];
    updated[index] = { ...updated[index], [field]: value, isEdited: true };
    if (field === "start" || field === "end") {
      const newHours = calculateHours(updated[index].start, updated[index].end);
      if (newHours !== null) updated[index].hours = newHours;
    }
    setWeeklyPreview(updated);
  };

  const resetPreviewRow = (index: number) => {
    const updated = [...weeklyPreview];
    const dayOfWeek = new Date(updated[index].date).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (isWeekend && weeklyForm.weekend_24h)
      updated[index] = {
        date: updated[index].date,
        start: "00:00",
        end: "23:59",
        hours: 24,
        isWeekend,
        isEdited: false,
      };
    else {
      const hours = calculateHours(weeklyForm.start_time, weeklyForm.end_time);
      updated[index] = {
        date: updated[index].date,
        start: weeklyForm.start_time,
        end: weeklyForm.end_time,
        hours: hours ?? 0,
        isWeekend,
        isEdited: false,
      };
    }
    setWeeklyPreview(updated);
  };

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
    weeklyOpen,
    setWeeklyOpen,
    weeklyForm,
    setWeeklyForm,
    weeklyPreview,
    setWeeklyPreview,
    patchWeeklyForm,
    resetWeeklyForm,
    updatePreviewRow,
    resetPreviewRow,
  };
};
