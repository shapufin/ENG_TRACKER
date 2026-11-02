import React from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarPanel } from "./CalendarPanel";
import { cn } from "@/lib/utils";

interface CalendarPopoverContentProps {
  value: string;
  onSelect: (date: Date, isoDate: string) => void;
}

export const CalendarPopoverContent: React.FC<CalendarPopoverContentProps> = ({
  value,
  onSelect,
}) => (
  <Popover.Portal>
    <Popover.Content
      className={cn(
        "w-[280px] p-3",
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
      <CalendarPanel value={value} onSelect={onSelect} />
      <Popover.Arrow className="fill-popover" />
    </Popover.Content>
  </Popover.Portal>
);
