import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SwitchField } from "@/components/common/forms/SwitchField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FormInputFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  error?: string;
  type?: string;
}

export const FormInputField: React.FC<FormInputFieldProps> = ({
  label,
  value,
  onChange,
  error,
  type = "text",
}) => {
  const inputId = React.useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={error ? "border-destructive" : ""}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};

interface FormRoleCheckboxesProps {
  is_hr_user: boolean;
  is_italian_tl_role: boolean;
  is_albanian_tl_role: boolean;
  is_cr_admin?: boolean;
  prefix: string;
  onChange: (key: string, value: boolean) => void;
}

export const FormRoleCheckboxes: React.FC<FormRoleCheckboxesProps> = ({
  is_hr_user,
  is_italian_tl_role,
  is_albanian_tl_role,
  is_cr_admin = false,
  prefix,
  onChange,
}) => (
  <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
    <SwitchField
      id={`${prefix}_is_hr`}
      label="HR"
      description="Human resources user"
      checked={is_hr_user}
      onCheckedChange={(v) => onChange("is_hr_user", v)}
    />
    <SwitchField
      id={`${prefix}_it_tl`}
      label="IT TL"
      description="Italian team leader"
      checked={is_italian_tl_role}
      onCheckedChange={(v) => onChange("is_italian_tl_role", v)}
    />
    <SwitchField
      id={`${prefix}_al_tl`}
      label="AL TL"
      description="Albanian team leader"
      checked={is_albanian_tl_role}
      onCheckedChange={(v) => onChange("is_albanian_tl_role", v)}
    />
    <SwitchField
      id={`${prefix}_cr_admin`}
      label="CR Admin"
      description="Control Room admin access"
      checked={is_cr_admin}
      onCheckedChange={(v) => onChange("is_cr_admin", v)}
    />
  </div>
);

interface FormTLSelectProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tls: any[];
}

export const FormTLSelect: React.FC<FormTLSelectProps> = ({ label, value, onChange, tls }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="No TL" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No TL</SelectItem>
        {tls?.map((tl) => (
          <SelectItem key={tl.id} value={String(tl.id)}>
            {tl.full_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);
