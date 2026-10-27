import React from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CADENCE_LABELS, NTH_WEEK_OPTIONS, WEEKDAY_OPTIONS } from "@/types/hbprAssignment";
import type { HbprCadence } from "@/types/hbprAssignment";

export interface CadenceScheduleValue {
  cadence: HbprCadence;
  cadence_day_of_week: number | null;
  cadence_nth_week: number | null;
}

interface CadenceScheduleFieldsProps {
  /** Prefix for the control ids, so two dialogs never share an id. */
  idPrefix: string;
  value: CadenceScheduleValue;
  onFieldChange: <K extends keyof CadenceScheduleValue>(
    key: K,
    value: CadenceScheduleValue[K]
  ) => void;
}

/**
 * The HBPR meeting schedule controls: cadence, weekday, and the monthly
 * "nth weekday" pattern. Core-owned: the admin assignment dialog and the TL
 * scorecard plugin both render it, never the other way round.
 */
export const CadenceScheduleFields: React.FC<CadenceScheduleFieldsProps> = ({
  idPrefix,
  value,
  onFieldChange,
}) => {
  const isMonthly = value.cadence === "monthly";
  const isWeeklyOrBiweekly = value.cadence === "weekly" || value.cadence === "biweekly";
  const isNthWeekdayMonthly = isMonthly && value.cadence_nth_week !== null;

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-cadence`}>Meeting cadence</Label>
        <Select
          value={value.cadence}
          onValueChange={(v) => {
            const newCadence = v as HbprCadence;
            onFieldChange("cadence", newCadence);
            if (newCadence !== "monthly") {
              onFieldChange("cadence_nth_week", null);
            }
          }}
        >
          <SelectTrigger id={`${idPrefix}-cadence`} aria-label="Meeting cadence" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CADENCE_LABELS) as HbprCadence[]).map((cadence) => (
              <SelectItem key={cadence} value={cadence}>
                {CADENCE_LABELS[cadence]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Weekly & Biweekly Day of Week */}
      {isWeeklyOrBiweekly && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-weekday`}>Scheduled day of week</Label>
          <Select
            value={value.cadence_day_of_week !== null ? String(value.cadence_day_of_week) : "auto"}
            onValueChange={(v) =>
              onFieldChange("cadence_day_of_week", v === "auto" ? null : Number(v))
            }
          >
            <SelectTrigger
              id={`${idPrefix}-weekday`}
              aria-label="Scheduled day of week"
              className="w-full"
            >
              <SelectValue placeholder="Anchor from start date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Default (Anchor from start date)</SelectItem>
              {WEEKDAY_OPTIONS.map((day) => (
                <SelectItem key={day.value} value={String(day.value)}>
                  {day.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Monthly Pattern Selection */}
      {isMonthly && (
        <div className="bg-muted/20 space-y-3 rounded-lg border p-3">
          <Label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Monthly recurrence pattern
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              variant={!isNthWeekdayMonthly ? "default" : "outline"}
              aria-pressed={!isNthWeekdayMonthly}
              onClick={() => {
                onFieldChange("cadence_nth_week", null);
                onFieldChange("cadence_day_of_week", null);
              }}
            >
              Day of month
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isNthWeekdayMonthly ? "default" : "outline"}
              aria-pressed={isNthWeekdayMonthly}
              onClick={() => {
                onFieldChange("cadence_nth_week", 2); // Default to 2nd
                if (value.cadence_day_of_week === null) {
                  onFieldChange("cadence_day_of_week", 3); // Default to Thursday
                }
              }}
            >
              Specific weekday
            </Button>
          </div>

          {isNthWeekdayMonthly && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <Label htmlFor={`${idPrefix}-nth-week`} className="text-xs">
                  Week of month
                </Label>
                <Select
                  value={String(value.cadence_nth_week ?? 2)}
                  onValueChange={(v) => onFieldChange("cadence_nth_week", Number(v))}
                >
                  <SelectTrigger id={`${idPrefix}-nth-week`} aria-label="Week of month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NTH_WEEK_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`${idPrefix}-monthly-weekday`} className="text-xs">
                  Day of week
                </Label>
                <Select
                  value={String(value.cadence_day_of_week ?? 3)}
                  onValueChange={(v) => onFieldChange("cadence_day_of_week", Number(v))}
                >
                  <SelectTrigger id={`${idPrefix}-monthly-weekday`} aria-label="Day of week">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
