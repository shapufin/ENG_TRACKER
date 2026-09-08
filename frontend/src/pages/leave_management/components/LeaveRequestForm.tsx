import React from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
}

const REQUEST_TYPE_OPTIONS = [
  { value: "vacation" as const, label: "Vacation" },
  { value: "sick" as const, label: "Sick Leave" },
];

// fallow-ignore-next-line complexity
export const LeaveRequestForm: React.FC<LeaveRequestFormProps> = ({
  formData,
  formErrors,
  onChange,
}) => {
  const updateField = <K extends keyof LeaveFormData>(key: K, value: LeaveFormData[K]) => {
    onChange({ ...formData, [key]: value });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {formData.request_type === "sick" ? "Sick leave request" : "Vacation request"}
      </p>
      <div>
        <Label htmlFor="leave-request-type" className="text-xs font-medium">
          Request type
        </Label>
        <Select
          value={formData.request_type}
          onValueChange={(value) => updateField("request_type", value as "vacation" | "sick")}
        >
          <SelectTrigger
            id="leave-request-type"
            className={`mt-1 h-9 ${formErrors.request_type ? "border-destructive" : ""}`}
          >
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {REQUEST_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {formErrors.request_type && (
          <p className="mt-1 text-xs text-destructive">{formErrors.request_type}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
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
