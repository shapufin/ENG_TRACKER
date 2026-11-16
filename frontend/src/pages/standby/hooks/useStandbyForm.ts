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

const MIDNIGHT = "00:00";

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};

const makeRow = (dateStr: string, start: string, end: string): WeeklyPreviewEntry => {
  const dayOfWeek = parseLocalDate(dateStr).getDay();
  return {
    date: dateStr,
    start,
    end,
    hours: calculateHours(start, end) ?? 0,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    isEdited: false,
  };
};

/**
 * One row per standby segment, every row inside its own calendar day (item 63).
 * A night is cut at midnight: the evening part (start-00:00) on its own date and
 * the morning part (00:00-end) on the next one. A 24h weekend day is 00:00-00:00.
 * The week spans 8 dates: the last night closes on the next day with 00:00-end.
 */
const buildWeeklyPreview = (form: WeeklyFormState): WeeklyPreviewEntry[] => {
  if (!form.start_date) return [];
  const first = parseLocalDate(form.start_date);
  const crossesMidnight =
    !!form.start_time && !!form.end_time && toMinutes(form.end_time) <= toMinutes(form.start_time);
  const hasMorning = crossesMidnight && form.end_time !== MIDNIGHT;
  const dateAt = (offset: number) => {
    const date = new Date(first);
    date.setDate(first.getDate() + offset);
    return date;
  };
  const isFullDay = (date: Date) =>
    form.weekend_24h && (date.getDay() === 0 || date.getDay() === 6);

  const preview: WeeklyPreviewEntry[] = [];
  for (let i = 0; i < 7; i++) {
    const date = dateAt(i);
    const dateStr = toLocalISODate(date);
    if (isFullDay(date)) {
      preview.push(makeRow(dateStr, MIDNIGHT, MIDNIGHT));
    } else if (!crossesMidnight) {
      preview.push(makeRow(dateStr, form.start_time, form.end_time));
    } else {
      if (hasMorning && i > 0) preview.push(makeRow(dateStr, MIDNIGHT, form.end_time));
      preview.push(makeRow(dateStr, form.start_time, MIDNIGHT));
    }
  }
  // A 24h Saturday already ends at midnight into a 24h Sunday: only a normal
  // last day (or a 24h Sunday) leaves a night to close.
  const last = dateAt(6);
  const lastEndsInNight = !(isFullDay(last) && last.getDay() === 6);
  if (hasMorning && lastEndsInNight) {
    preview.push(makeRow(toLocalISODate(dateAt(7)), MIDNIGHT, form.end_time));
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
    // The builder is the one source of every row, so a reset can never drift from it.
    const rebuilt = buildWeeklyPreview(weeklyForm)[index];
    if (!rebuilt) return;
    const updated = [...weeklyPreview];
    updated[index] = rebuilt;
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
