import React, { useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ImportField } from "../types/dataImport";

interface ValueTransformPanelProps {
  fields: ImportField[];
  fieldMapping: Record<string, string | null>;
  detectedValues: Record<string, string[]>;
  valueTransforms: Record<string, Record<string, string>>;
  onTransformChange: (fieldKey: string, rawValue: string, canonicalValue: string | null) => void;
}

const NO_TRANSFORM = "__no_transform__";

export const ValueTransformPanel: React.FC<ValueTransformPanelProps> = ({
  fields,
  fieldMapping,
  detectedValues,
  valueTransforms,
  onTransformChange,
}) => {
  const choiceFields = useMemo(
    () => fields.filter((f) => f.field_type === "choice" && f.choices && f.choices.length > 0),
    [fields]
  );

  const mappedChoiceFields = useMemo(
    () =>
      choiceFields
        .map((field) => ({ field, column: fieldMapping[field.key] }))
        .filter((item): item is { field: ImportField; column: string } => !!item.column),
    [choiceFields, fieldMapping]
  );

  if (mappedChoiceFields.length === 0) {
    return null;
  }

  return (
    <GlassCard isHoverLift={false}>
      <CardHeader>
        <CardTitle>Value Transforms</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Map raw spreadsheet values to the canonical values recognised by the system.
        </p>
        {mappedChoiceFields.map(({ field, column }) => {
          const rawValues = detectedValues[column] ?? [];
          const transforms = valueTransforms[field.key] ?? {};
          return (
            <div key={field.key} className="space-y-3 rounded-lg border p-4">
              <div className="space-y-1">
                <Label className="text-base">{field.label}</Label>
                <p className="text-xs text-muted-foreground">
                  Column: <span className="font-medium">{column}</span>
                </p>
              </div>
              {rawValues.length === 0 ? (
                <p className="text-sm text-muted-foreground">No values detected for this column.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                  {rawValues.map((rawValue) => {
                    const current = transforms[rawValue];
                    return (
                      <div key={rawValue} className="flex items-center gap-3">
                        <span className="min-w-[120px] text-sm font-medium">{rawValue}</span>
                        <Select
                          value={current ?? NO_TRANSFORM}
                          onValueChange={(value) =>
                            onTransformChange(
                              field.key,
                              rawValue,
                              value === NO_TRANSFORM ? null : value
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Map to..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_TRANSFORM}>— No transform —</SelectItem>
                            {field.choices?.map(([code, label]) => (
                              <SelectItem key={code} value={code}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </GlassCard>
  );
};
