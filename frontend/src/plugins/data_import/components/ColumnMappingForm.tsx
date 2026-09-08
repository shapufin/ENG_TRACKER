import React, { useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ImportField } from "../types/dataImport";

interface ColumnMappingFormProps {
  fields: ImportField[];
  detectedColumns: string[];
  fieldMapping: Record<string, string | null>;
  defaultValues: Record<string, unknown>;
  onFieldMappingChange: (fieldKey: string, column: string | null) => void;
  onDefaultValueChange: (fieldKey: string, value: unknown) => void;
}

const SKIP_VALUE = "__skip__";

export const ColumnMappingForm: React.FC<ColumnMappingFormProps> = ({
  fields,
  detectedColumns,
  fieldMapping,
  defaultValues,
  onFieldMappingChange,
  onDefaultValueChange,
}) => {
  const missingRequired = useMemo(() => {
    return fields
      .filter((f) => f.required)
      .filter((f) => !fieldMapping[f.key] && defaultValues[f.key] === undefined)
      .map((f) => f.key);
  }, [fields, fieldMapping, defaultValues]);

  const renderDefaultInput = (field: ImportField) => {
    const value = defaultValues[field.key] ?? "";
    if (field.field_type === "bool") {
      return (
        <Select
          value={value === true ? "true" : value === false ? "false" : ""}
          onValueChange={(v) =>
            onDefaultValueChange(field.key, v === "true" ? true : v === "false" ? false : undefined)
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="No default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">True</SelectItem>
            <SelectItem value="false">False</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type={field.field_type === "decimal" || field.field_type === "integer" ? "number" : "text"}
        placeholder={`Default ${field.label.toLowerCase()}`}
        value={String(value)}
        onChange={(e) =>
          onDefaultValueChange(field.key, e.target.value === "" ? undefined : e.target.value)
        }
        className="w-[180px]"
      />
    );
  };

  return (
    <GlassCard isHoverLift={false}>
      <CardHeader>
        <CardTitle>Column Mapping</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {missingRequired.length > 0 && (
          <p className="text-sm text-destructive">
            Missing required fields:{" "}
            {missingRequired.map((k) => fields.find((f) => f.key === k)?.label).join(", ")}
          </p>
        )}
        <div className="space-y-3">
          {fields
            .filter((field) => field.key !== "password")
            .map((field) => {
              const mappedValue = fieldMapping[field.key] ?? SKIP_VALUE;
              const isSkipped = mappedValue === SKIP_VALUE;
              return (
                <div
                  key={field.key}
                  className={`grid items-start gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto] ${
                    field.required && isSkipped && !defaultValues[field.key]
                      ? "border-destructive/50"
                      : ""
                  }`}
                >
                  <div>
                    <Label className="flex items-center gap-1">
                      {field.label}
                      {field.required && <span className="text-destructive">*</span>}
                    </Label>
                    {field.help_text && (
                      <p className="text-xs text-muted-foreground">{field.help_text}</p>
                    )}
                  </div>
                  <Select
                    value={mappedValue}
                    onValueChange={(value) =>
                      onFieldMappingChange(field.key, value === SKIP_VALUE ? null : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP_VALUE}>— Skip / leave empty —</SelectItem>
                      {detectedColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Default value</Label>
                    {renderDefaultInput(field)}
                  </div>
                </div>
              );
            })}
        </div>
      </CardContent>
    </GlassCard>
  );
};
