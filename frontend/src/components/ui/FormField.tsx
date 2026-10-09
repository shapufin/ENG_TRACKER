import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FormFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  list?: string;
  type?: string;
  /** Quiet 12px hint under the field; announced with the field via aria-describedby. */
  helper?: string;
  min?: number;
  max?: number;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  id,
  label,
  value,
  onChange,
  error,
  required,
  placeholder,
  list,
  type,
  helper,
  min,
  max,
  className,
}) => {
  const describedBy =
    [error && `${id}-error`, helper && `${id}-helper`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className ? `space-y-2 ${className}` : "space-y-2"}>
      <Label
        htmlFor={id}
        className={
          required ? "after:text-tone-danger-text after:ml-0.5 after:content-['*']" : undefined
        }
      >
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        list={list}
        type={type}
        min={min}
        max={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={error ? "border-destructive" : ""}
      />
      {helper && (
        <p id={`${id}-helper`} className="text-muted-foreground text-xs">
          {helper}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
};
