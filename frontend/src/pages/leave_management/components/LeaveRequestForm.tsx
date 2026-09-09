import React from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/DatePicker";

interface LeaveFormData {
  request_type: "vacation" | "sick";
  start_date: string;
  end_date: string;
  reason: string;
}

interface FormErrors {
  request_type?: string;
  start_date?: string;
  end_date?: string;
}

interface LeaveRequestFormProps {
  formData: LeaveFormData;
  formErrors: FormErrors;
  onChange: (data: LeaveFormData) => void;
  /** Real remaining vacation days for the allowance banner; omit to hide it. */
  remainingDays?: number;
}

const REQUEST_TYPE_OPTIONS = [
  { value: "vacation" as const, label: "Vacation", dotClass: "bg-emerald-500" },
  { value: "sick" as const, label: "Sick Leave", dotClass: "bg-rose-500" },
];

// fallow-ignore-next-line complexity
export const LeaveRequestForm: React.FC<LeaveRequestFormProps> = ({
  formData,
  formErrors,
  onChange,
  remainingDays,
}) => {
  const updateField = <K extends keyof LeaveFormData>(key: K, value: LeaveFormData[K]) => {
    onChange({ ...formData, [key]: value });
  };

  return (
    <div className="space-y-3">
      {typeof remainingDays === "number" && (
        <div
          role="status"
          aria-label={`Allowance remaining ${remainingDays} days`}
          className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs"
        >
          <span className="text-muted-foreground">Allowance remaining</span>
          <span className="font-mono font-bold text-foreground">{remainingDays} days</span>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {formData.request_type === "sick" ? "Sick leave request" : "Vacation request"}
      </p>
      <div>
        <span id="leave-request-type-label" className="text-xs font-medium">
          Request type
        </span>
        <div
          role="group"
          aria-labelledby="leave-request-type-label"
          aria-invalid={!!formErrors.request_type}
          className={`mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2 ${
            formErrors.request_type ? "rounded-xl ring-2 ring-destructive/40" : ""
          }`}
        >
          {REQUEST_TYPE_OPTIONS.map((option) => {
            const selected = formData.request_type === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => updateField("request_type", option.value)}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition-all ${
                  selected
                    ? "border-primary/60 bg-primary/10 text-foreground shadow-sm ring-2 ring-primary/20"
                    : "border-border bg-surface-sunken text-muted-foreground hover:text-foreground"
                }`}
              >
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${option.dotClass}`} />
                {option.label}
              </button>
            );
          })}
        </div>
        {formErrors.request_type && (
          <p className="mt-1 text-xs text-destructive">{formErrors.request_type}</p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="leave-start-date" className="text-xs font-medium">
            Start date
          </Label>
          <div className="mt-1">
            <DatePicker
              id="leave-start-date"
              value={formData.start_date}
              onChange={(v) => updateField("start_date", v)}
              placeholder="DD/MM/YYYY"
            />
            {formErrors.start_date && (
              <p className="mt-1 text-xs text-destructive">{formErrors.start_date}</p>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="leave-end-date" className="text-xs font-medium">
            End date
          </Label>
          <div className="mt-1">
            <DatePicker
              id="leave-end-date"
              value={formData.end_date}
              onChange={(v) => updateField("end_date", v)}
              placeholder="DD/MM/YYYY"
            />
            {formErrors.end_date && (
              <p className="mt-1 text-xs text-destructive">{formErrors.end_date}</p>
            )}
          </div>
        </div>
      </div>
      <div>
        <Label htmlFor="leave-reason" className="text-xs font-medium">
          Reason
        </Label>
        <Textarea
          id="leave-reason"
          className="mt-1"
          rows={3}
          value={formData.reason}
          onChange={(e) => updateField("reason", e.target.value)}
          placeholder="Optional reason..."
        />
      </div>
    </div>
  );
};
