import { useState } from "react";
import type { LeaveRequest } from "@/types";

type RequestType = LeaveRequest["request_type"];

interface LeaveFormState {
  request_type: RequestType;
  start_date: string;
  end_date: string;
  reason: string;
}

interface FormErrors {
  request_type?: string;
  start_date?: string;
  end_date?: string;
}

const DEFAULT_FORM_STATE: LeaveFormState = {
  request_type: "vacation",
  start_date: "",
  end_date: "",
  reason: "",
};

export const useLeaveForm = () => {
  const [formData, setFormData] = useState<LeaveFormState>(DEFAULT_FORM_STATE);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [editing, setEditing] = useState<LeaveRequest | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const resetForm = () => {
    setFormData(DEFAULT_FORM_STATE);
    setFormErrors({});
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (req: LeaveRequest) => {
    setEditing(req);
    setFormData({
      request_type: req.request_type,
      start_date: req.start_date,
      end_date: req.end_date,
      reason: req.reason || "",
    });
    setFormOpen(true);
  };

  // fallow-ignore-next-line complexity
  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    if (!formData.request_type) errors.request_type = "Request type is required";
    if (!formData.start_date) errors.start_date = "Start date is required";
    if (!formData.end_date) errors.end_date = "End date is required";
    else if (formData.start_date && formData.end_date) {
      const startDate = new Date(formData.start_date);
      const endDate = new Date(formData.end_date);
      if (endDate < startDate) errors.end_date = "End date must be after start date";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const updateField = <K extends keyof LeaveFormState>(key: K, value: LeaveFormState[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  return {
    formData,
    setFormData,
    formErrors,
    setFormErrors,
    editing,
    formOpen,
    setFormOpen,
    resetForm,
    openCreate,
    openEdit,
    validateForm,
    updateField,
  };
};
