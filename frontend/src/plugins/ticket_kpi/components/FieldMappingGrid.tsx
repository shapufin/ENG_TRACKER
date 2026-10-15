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
  /** Real column headers read from an uploaded sample/export file, offered as
   *  autocomplete suggestions so the user can pick instead of retyping a
   *  column name by hand. Optional — omit when no file has been read yet. */
  detectedColumns?: string[];
}

export const FieldMappingGrid: React.FC<FieldMappingGridProps> = ({
  fields,
  mapping,
  onChange,
  detectedColumns,
}) => (
  <div className="grid grid-cols-3 gap-2">
    {detectedColumns && detectedColumns.length > 0 && (
      <datalist id="ticket-kpi-detected-columns">
        {detectedColumns.map((col) => (
          <option key={col} value={col} />
        ))}
      </datalist>
    )}
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
          list={detectedColumns && detectedColumns.length > 0 ? "ticket-kpi-detected-columns" : undefined}
        />
      </div>
    ))}
  </div>
);
