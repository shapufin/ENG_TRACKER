import React, { useMemo, useState } from "react";
import { addMonths, isValid, subMonths } from "date-fns";
import * as Popover from "@radix-ui/react-popover";
import { CalendarPanel } from "./CalendarPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { Button } from "./button";
import { Input } from "./input";
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

export const DateRangePickerPopoverContent: React.FC<DateRangePickerPopoverContentProps> = ({
  from,
  to,
  presets,
  onCommit,
  onClose,
}) => {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [anchorMonth, setAnchorMonth] = useState(() => {
    const parsed = draftFrom ? new Date(draftFrom + "T00:00:00") : new Date();
    return isValid(parsed) ? parsed : new Date();
  });

  const rightMonth = useMemo(() => addMonths(anchorMonth, 1), [anchorMonth]);

  const handleDaySelect = (isoDate: string) => {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(isoDate);
      setDraftTo("");
      return;
    }
    if (isoDate < draftFrom) {
      setDraftFrom(isoDate);
      setDraftTo("");
      return;
    }
    setDraftTo(isoDate);
  };

  const handleFromTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseDDMMYYYYDate(e.target.value);
    if (parsed) setDraftFrom(toLocalISODate(parsed));
  };

  const handleToTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseDDMMYYYYDate(e.target.value);
    if (parsed) setDraftTo(toLocalISODate(parsed));
  };

  const handlePreset = (preset: QuickRangePreset) => {
    const range = preset.getRange();
    onCommit(range);
  };

  const handleSave = () => {
    onCommit({ from: draftFrom, to: draftTo || draftFrom });
  };

  return (
    <Popover.Portal>
      <Popover.Content
        className={cn(
          "w-[calc(100vw-2rem)] max-w-sm p-3 sm:w-[560px] sm:max-w-none",
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
        <Tabs defaultValue="quick">
          <TabsList className="mb-3 grid w-full grid-cols-2">
            <TabsTrigger value="quick">Quick Ranges</TabsTrigger>
            <TabsTrigger value="custom">Custom Range</TabsTrigger>
          </TabsList>

          <TabsContent value="quick" className="mt-0">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={() => handlePreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="custom" className="mt-0 space-y-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CalendarPanel
                value={draftFrom}
                rangeEnd={draftTo || undefined}
                month={anchorMonth}
                onMonthChange={setAnchorMonth}
                onSelect={(_date, iso) => handleDaySelect(iso)}
              />
              <div className="hidden sm:block">
                <CalendarPanel
                  value={draftFrom}
                  rangeEnd={draftTo || undefined}
                  month={rightMonth}
                  onMonthChange={(m) => setAnchorMonth(subMonths(m, 1))}
                  onSelect={(_date, iso) => handleDaySelect(iso)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                aria-label="Start date"
                placeholder="DD/MM/YYYY"
                defaultValue={formatDateDDMMYYYY(draftFrom)}
                onBlur={handleFromTextChange}
              />
              <Input
                aria-label="End date"
                placeholder="DD/MM/YYYY"
                defaultValue={formatDateDDMMYYYY(draftTo)}
                onBlur={handleToTextChange}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={!draftFrom}>
            Save
          </Button>
        </div>

        <Popover.Arrow className="fill-popover" />
      </Popover.Content>
    </Popover.Portal>
  );
};
