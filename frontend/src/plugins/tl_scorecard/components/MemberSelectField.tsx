import React from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SelectOption {
  id: number;
  label: string;
}

interface OptionSelectProps {
  id: string;
  value: number | null;
  options: SelectOption[];
  placeholder: string;
  onChange: (id: number) => void;
}

/** Shared Select wrapper for picking one option by id (used by member and person pickers). */
export const OptionSelect: React.FC<OptionSelectProps> = ({
  id,
  value,
  options,
  placeholder,
  onChange,
}) => (
  <Select
    value={value === null ? undefined : String(value)}
    onValueChange={(v) => onChange(Number(v))}
  >
    <SelectTrigger id={id} className="w-full">
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem key={option.id} value={String(option.id)}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

interface MemberSelectFieldProps {
  id: string;
  value: number | null;
  options: SelectOption[];
  onChange: (id: number) => void;
  loadError?: string | null;
  label?: string;
}

/** The standard "pick a team member" field: FieldLabel + OptionSelect + load error. */
export const MemberSelectField: React.FC<MemberSelectFieldProps> = ({
  id,
  value,
  options,
  onChange,
  loadError,
  label = "Team member",
}) => (
  <div className="space-y-2">
    <FieldLabel htmlFor={id} required>
      {label}
    </FieldLabel>
    <OptionSelect
      id={id}
      value={value}
      options={options}
      placeholder="Select a team member..."
      onChange={onChange}
    />
    {loadError && (
      <p role="alert" className="text-tone-danger-text text-xs">
        {loadError}
      </p>
    )}
  </div>
);
