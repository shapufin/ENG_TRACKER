import { useState, useCallback } from "react";
import type { LeaveBalance } from "@/types";

interface LeaveBalanceFormState {
  user: string;
  leave_type: string;
  year: string;
  total_days: string;
  used_days: string;
  is_carry_over: boolean;
  expires_at: string;
  accrual_start_date: string;
}

const DEFAULT_FORM: LeaveBalanceFormState = {
  user: "",
  leave_type: "",
  year: "",
  total_days: "",
  used_days: "",
  is_carry_over: false,
  expires_at: "",
  accrual_start_date: "",
};

export const useLeaveBalanceForm = () => {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveBalance | null>(null);
  const [form, setForm] = useState<LeaveBalanceFormState>(DEFAULT_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setForm({
      user: "",
      leave_type: "",
      year: String(new Date().getFullYear()),
      total_days: "",
      used_days: "",
      is_carry_over: false,
      expires_at: "",
      accrual_start_date: "",
    });
    setFormErrors({});
  };

  const openCreate = useCallback(() => {
    setEditing(null);
    resetForm();
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((balance: LeaveBalance) => {
    setEditing(balance);
    setForm({
      user: String(balance.user),
      leave_type: balance.leave_type,
      year: String(balance.year),
      total_days: String(balance.total_days),
      used_days: String(balance.used_days),
      is_carry_over: balance.is_carry_over || false,
      expires_at: balance.expires_at || "",
      accrual_start_date: balance.accrual_start_date || "",
    });
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const updateField = <K extends keyof LeaveBalanceFormState>(
    key: K,
    value: LeaveBalanceFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
  };

  const buildPayload = (): Partial<LeaveBalance> => ({
    user: Number(form.user),
    leave_type: form.leave_type as LeaveBalance["leave_type"],
    year: Number(form.year),
    total_days: Number(form.total_days),
    used_days: Number(form.used_days),
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
    buildPayload,
  };
};
