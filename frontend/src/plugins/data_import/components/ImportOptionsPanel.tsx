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
import { cn } from "@/lib/utils";
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
    <GlassCard>
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
                    <p className="text-muted-foreground text-xs">{option.help_text}</p>
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
            const choices = option.choices ?? [];
            // Short lists read better as selectable cards (conflict-strategy
            // style) than a collapsed dropdown. Purely presentational: the
            // schema still owns the choices, longer lists keep the Select.
            if (choices.length <= 3) {
              return (
                <fieldset key={option.key} className="space-y-2 rounded-lg border p-4">
                  <legend className="px-1 text-sm font-medium">{option.label}</legend>
                  {choices.map(([code, label]) => {
                    const checked = value === code;
                    return (
                      <label
                        key={code}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                          checked
                            ? "border-primary/40 bg-primary/[0.04]"
                            : "border-border/60 bg-background/40 hover:border-border"
                        )}
                      >
                        <input
                          type="radio"
                          name={id}
                          checked={checked}
                          onChange={() => onChange(option.key, code)}
                          className="accent-primary h-4 w-4 shrink-0"
                        />
                        <span className="font-medium">{label}</span>
                      </label>
                    );
                  })}
                  {option.help_text && (
                    <p className="text-muted-foreground text-xs">{option.help_text}</p>
                  )}
                </fieldset>
              );
            }
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
                  <p className="text-muted-foreground text-xs">{option.help_text}</p>
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
                <p className="text-muted-foreground text-xs">{option.help_text}</p>
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
