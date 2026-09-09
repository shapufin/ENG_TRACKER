/**
 * Import options, rendered entirely from the importer's option schema.
 *
 * There is deliberately no branch on `target_key` here: an importer declares
 * its own options server-side, so adding a target never requires a change in
 * this file. The one target-shaped control that remains is the password
 * column picker, and it is driven by the `password_strategy` option's value,
 * not by which target is selected.
 */
import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ImportOption } from "../types/dataImport";

const NO_COLUMN = "__skip__";

interface ImportOptionsPanelProps {
  /** The selected target's option schema. */
  optionSchema: ImportOption[];
  detectedColumns: string[];
  passwordColumn: string | null;
  onPasswordColumnChange: (column: string | null) => void;
  options: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

/** True when every dependency in `depends_on` currently holds its value. */
const isVisible = (option: ImportOption, values: Record<string, unknown>): boolean => {
  if (!option.depends_on) return true;
  return Object.entries(option.depends_on).every(([key, expected]) => values[key] === expected);
};

export const ImportOptionsPanel: React.FC<ImportOptionsPanelProps> = ({
  optionSchema,
  detectedColumns,
  passwordColumn,
  onPasswordColumnChange,
  options,
  onChange,
}) => {
  /** The effective value: what the user chose, else the schema default. */
  const valueOf = (option: ImportOption): unknown =>
    options[option.key] ?? option.default ?? undefined;

  const effectiveValues = Object.fromEntries(
    optionSchema.map((option) => [option.key, valueOf(option)])
  );

  const visibleOptions = optionSchema.filter((option) => isVisible(option, effectiveValues));
  const needsPasswordColumn = effectiveValues.password_strategy === "column";

  if (visibleOptions.length === 0 && !needsPasswordColumn) return null;

  return (
    <GlassCard isHoverLift={false}>
      <CardHeader>
        <CardTitle>Import Options</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {visibleOptions.map((option) => {
          const id = `import-option-${option.key}`;
          const value = effectiveValues[option.key];

          if (option.option_type === "bool") {
            return (
              <div
                key={option.key}
                className="flex items-center justify-between gap-4 rounded-lg border p-4"
              >
                <div className="space-y-0.5">
                  <Label htmlFor={id}>{option.label}</Label>
                  {option.help_text && (
                    <p className="text-xs text-muted-foreground">{option.help_text}</p>
                  )}
                </div>
                <Switch
                  id={id}
                  checked={value === true}
                  onCheckedChange={(checked) => onChange(option.key, checked)}
                />
              </div>
            );
          }

          if (option.option_type === "choice") {
            return (
              <div key={option.key} className="space-y-2 rounded-lg border p-4">
                <Label htmlFor={id}>{option.label}</Label>
                <Select
                  value={typeof value === "string" ? value : ""}
                  onValueChange={(next) => onChange(option.key, next)}
                >
                  <SelectTrigger id={id}>
                    <SelectValue placeholder={`Select ${option.label.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {(option.choices ?? []).map(([code, label]) => (
                      <SelectItem key={code} value={code}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {option.help_text && (
                  <p className="text-xs text-muted-foreground">{option.help_text}</p>
                )}
              </div>
            );
          }

          return (
            <div key={option.key} className="space-y-2 rounded-lg border p-4">
              <Label htmlFor={id}>{option.label}</Label>
              <Input
                id={id}
                type={option.option_type === "secret" ? "password" : "text"}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => onChange(option.key, e.target.value)}
              />
              {option.help_text && (
                <p className="text-xs text-muted-foreground">{option.help_text}</p>
              )}
            </div>
          );
        })}

        {needsPasswordColumn && (
          <div className="space-y-2 rounded-lg border p-4">
            <Label htmlFor="import-password-column">Password column</Label>
            <Select
              value={passwordColumn ?? NO_COLUMN}
              onValueChange={(next) => onPasswordColumnChange(next === NO_COLUMN ? null : next)}
            >
              <SelectTrigger id="import-password-column">
                <SelectValue placeholder="Select the password column" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COLUMN}>— Select a column —</SelectItem>
                {detectedColumns.map((column) => (
                  <SelectItem key={column} value={column}>
                    {column}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
};
