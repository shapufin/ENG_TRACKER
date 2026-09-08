import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FieldDef {
  key: string;
  label: string;
  required: boolean;
}

interface FieldMappingGridProps {
  fields: FieldDef[];
  mapping: Record<string, string>;
  onChange: (mapping: Record<string, string>) => void;
}

export const FieldMappingGrid: React.FC<FieldMappingGridProps> = ({
  fields,
  mapping,
  onChange,
}) => (
  <div className="grid grid-cols-3 gap-2">
    {fields.map((f) => (
      <div key={f.key} className="space-y-1">
        <Label className="text-xs">
          {f.label}
          {f.required && <span className="text-destructive">*</span>}
        </Label>
        <Input
          value={mapping[f.key] || ""}
          onChange={(e) => onChange({ ...mapping, [f.key]: e.target.value })}
          placeholder="Column name"
          className="text-sm"
        />
      </div>
    ))}
  </div>
);
