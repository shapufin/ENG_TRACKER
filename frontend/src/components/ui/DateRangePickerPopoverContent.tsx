import React, { useState } from "react";
import { differenceInCalendarDays, isValid } from "date-fns";
import * as Popover from "@radix-ui/react-popover";
import { CalendarPanel } from "./CalendarPanel";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { toLocalISODate, formatDateDDMMYYYY, parseDDMMYYYYDate } from "@/lib/date-format-utils";
import type { QuickRangePreset } from "@/lib/quickDateRanges";
import { cn } from "@/lib/utils";

interface DateRangePickerPopoverContentProps {
  from: string;
  to: string;
  presets: QuickRangePreset[];
  onCommit: (range: { from: string; to: string }) => void;
  onClose: () => void;
}

const toDate = (iso: string) => new Date(iso + "T00:00:00");

/** Keep the earlier date as the start, whichever order the two were given in. */
const ordered = (a: string, b: string) => (a && b && b < a ? { from: b, to: a } : { from: a, to: b });

const progressText = (from: string, to: string) => {
  if (!from) return "Pick the start date";
  if (!to) return "Now pick the end date";
  const days = differenceInCalendarDays(toDate(to), toDate(from)) + 1;
  return `${days} ${days === 1 ? "day" : "days"} selected`;
};

export const DateRangePickerPopoverContent: React.FC<DateRangePickerPopoverContentProps> = ({
  from,
  to,
  presets,
  onCommit,
  onClose,
}) => {
  const [draft, setDraft] = useState(() => ordered(from, to));
  const [month, setMonth] = useState(() => {
    const parsed = from ? toDate(from) : new Date();
    return isValid(parsed) ? parsed : new Date();
  });

  const handleDaySelect = (iso: string) => {
    if (!draft.from || draft.to) {
      setDraft({ from: iso, to: "" });
      return;
    }
    setDraft(ordered(draft.from, iso));
  };

  const handleTyped = (edge: "from" | "to") => (e: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parseDDMMYYYYDate(e.target.value);
    if (!parsed) {
      // Not a date: put the field back to what the draft holds.
      e.target.value = formatDateDDMMYYYY(draft[edge]);
      return;
    }
    const iso = toLocalISODate(parsed);
    setDraft(edge === "from" ? ordered(iso, draft.to) : ordered(draft.from, iso));
    setMonth(parsed);
  };

  const commitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const handleApply = () => {
    onCommit({ from: draft.from, to: draft.to || draft.from });
  };

  return (
    <Popover.Portal>
      <Popover.Content
        className={cn(
          "w-[calc(100vw-2rem)] max-w-sm p-3 sm:w-[500px] sm:max-w-none",
          "bg-popover text-popover-foreground",
          "rounded-md border border-border shadow-lg",
          "z-[9999]"
        )}
        align="start"
        sideOffset={4}
        side="bottom"
        avoidCollisions={true}
        style={{ zIndex: 9999 }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <div className="sm:w-32 sm:shrink-0">
            <p className="text-muted-foreground mb-2 text-xs font-medium">Quick ranges</p>
            <div className="flex flex-wrap gap-1.5 sm:flex-col sm:flex-nowrap">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={() => onCommit(preset.getRange())}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-3 sm:border-l sm:border-border sm:pl-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="range-start">Start</Label>
                <Input
                  id="range-start"
                  key={`start-${draft.from}`}
                  aria-label="Start date"
                  placeholder="DD/MM/YYYY"
                  defaultValue={formatDateDDMMYYYY(draft.from)}
                  onBlur={handleTyped("from")}
                  onKeyDown={commitOnEnter}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="range-end">End</Label>
                <Input
                  id="range-end"
                  key={`end-${draft.to}`}
                  aria-label="End date"
                  placeholder="DD/MM/YYYY"
                  defaultValue={formatDateDDMMYYYY(draft.to)}
                  onBlur={handleTyped("to")}
                  onKeyDown={commitOnEnter}
                />
              </div>
            </div>

            <div>
              <CalendarPanel
                value={draft.from}
                rangeEnd={draft.to || undefined}
                month={month}
                onMonthChange={setMonth}
                onSelect={(_date, iso) => handleDaySelect(iso)}
              />
            </div>

            <p className="text-muted-foreground text-xs" aria-live="polite">
              {progressText(draft.from, draft.to)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleApply} disabled={!draft.from}>
            Apply
          </Button>
        </div>

        <Popover.Arrow className="fill-popover" />
      </Popover.Content>
    </Popover.Portal>
  );
};
