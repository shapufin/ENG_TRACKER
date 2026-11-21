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

type Edge = "from" | "to";

const toDate = (iso: string) => new Date(iso + "T00:00:00");

/** Keep the earlier date as the start, whichever order the two were given in. */
const ordered = (a: string, b: string) =>
  a && b && b < a ? { from: b, to: a } : { from: a, to: b };

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
  const [draft, setDraftState] = useState(() => ordered(from, to));
  const [texts, setTexts] = useState(() => ({
    from: formatDateDDMMYYYY(draft.from),
    to: formatDateDDMMYYYY(draft.to),
  }));
  // Which end the next calendar click sets.
  const [edge, setEdge] = useState<Edge>("from");
  const [month, setMonth] = useState(() => {
    const parsed = from ? toDate(from) : new Date();
    return isValid(parsed) ? parsed : new Date();
  });

  const setDraft = (next: { from: string; to: string }) => {
    setDraftState(next);
    setTexts({ from: formatDateDDMMYYYY(next.from), to: formatDateDDMMYYYY(next.to) });
  };

  const handleDaySelect = (iso: string) => {
    if (edge === "from") {
      // Keep the end when it still follows the new start, otherwise start over.
      setDraft({ from: iso, to: draft.to && draft.to >= iso ? draft.to : "" });
      setEdge("to");
      return;
    }
    setDraft(ordered(draft.from || iso, iso));
    setEdge("from");
  };

  /** Parse a typed value; null when it is not a date. */
  const parseTyped = (value: string) => {
    const parsed = parseDDMMYYYYDate(value);
    return parsed ? { parsed, iso: toLocalISODate(parsed) } : null;
  };

  const handleTyped = (which: Edge) => () => {
    const typed = parseTyped(texts[which]);
    if (!typed) {
      // Not a date: put the field back to what the draft holds.
      setTexts((prev) => ({ ...prev, [which]: formatDateDDMMYYYY(draft[which]) }));
      return;
    }
    setDraft(which === "from" ? ordered(typed.iso, draft.to) : ordered(draft.from, typed.iso));
    setMonth(typed.parsed);
  };

  const commitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const handleApply = () => {
    // Typed-but-not-blurred text counts: use it when it is a valid date.
    const typedFrom = parseTyped(texts.from);
    const typedTo = parseTyped(texts.to);
    const range = ordered(typedFrom?.iso ?? draft.from, typedTo?.iso ?? draft.to);
    if (!range.from) return;
    onCommit({ from: range.from, to: range.to || range.from });
  };

  const handleReset = () => {
    setDraft({ from: "", to: "" });
    setEdge("from");
  };

  const edgeField = (which: Edge, label: string, id: string, ariaLabel: string) => (
    <div
      className={cn(
        "space-y-1 rounded-md p-1",
        edge === which && "ring-primary/60 bg-primary/5 ring-2"
      )}
    >
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {edge === which && <span className="text-primary text-xs font-medium">Selecting</span>}
      </div>
      <Input
        id={id}
        aria-label={ariaLabel}
        placeholder="DD/MM/YYYY"
        value={texts[which]}
        onFocus={() => setEdge(which)}
        onChange={(e) => setTexts((prev) => ({ ...prev, [which]: e.target.value }))}
        onBlur={handleTyped(which)}
        onKeyDown={commitOnEnter}
      />
    </div>
  );

  return (
    <Popover.Portal>
      <Popover.Content
        className={cn(
          "w-[calc(100vw-2rem)] max-w-sm p-3 sm:w-[500px] sm:max-w-none",
          "bg-popover text-popover-foreground",
          "border-border rounded-md border shadow-lg",
          "z-[9999]"
        )}
        align="start"
        sideOffset={4}
        side="bottom"
        avoidCollisions={true}
        style={{ zIndex: 9999 }}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
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

          <div className="sm:border-border min-w-0 flex-1 space-y-3 sm:border-l sm:pl-4">
            <div className="grid grid-cols-2 gap-3">
              {edgeField("from", "Start", "range-start", "Start date")}
              {edgeField("to", "End", "range-end", "End date")}
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

        <div className="border-border mt-3 flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="ghost" size="sm" className="mr-auto" onClick={handleReset}>
            Reset
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            disabled={!draft.from && !parseTyped(texts.from)}
          >
            Apply
          </Button>
        </div>

        <Popover.Arrow className="fill-popover" />
      </Popover.Content>
    </Popover.Portal>
  );
};
