import React from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarPopoverContent } from "@/components/ui/CalendarPopoverContent";

interface CalendarPopoverProps {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}

export const CalendarPopover: React.FC<CalendarPopoverProps> = ({ value, onChange, children }) => {
  const handleDateSelect = (_date: Date, isoDate: string) => {
    onChange(isoDate);
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <CalendarPopoverContent value={value} onSelect={handleDateSelect} />
    </Popover.Root>
  );
};
