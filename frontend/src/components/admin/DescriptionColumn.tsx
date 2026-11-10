import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DescriptionColumnProps {
  value: string | null | undefined;
  maxWidthClassName?: string;
}

/**
 * Reusable description/reason column for log and approval tables.
 * Truncates long text in the cell and reveals the full note on hover/focus
 * (web Tooltip) or click/tap (mobile-friendly Popover).
 */
export const DescriptionColumn: React.FC<DescriptionColumnProps> = ({
  value,
  maxWidthClassName = "max-w-52",
}) => {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (!value) {
    return <span className="text-muted-foreground block text-sm">-</span>;
  }

  // `block` is load-bearing: max-width truncation requires block/inline-block.
  return (
    <TooltipProvider delayDuration={200}>
      <Popover
        open={popoverOpen}
        onOpenChange={(open) => {
          setPopoverOpen(open);
          if (open) setTooltipOpen(false);
        }}
      >
        <Tooltip open={popoverOpen ? false : tooltipOpen} onOpenChange={setTooltipOpen}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "text-muted-foreground hover:text-foreground focus-visible:ring-ring block min-h-6 w-full cursor-pointer truncate rounded-sm text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  maxWidthClassName
                )}
              >
                {value}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs break-words whitespace-pre-wrap">
            {value}
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          align="start"
          onClick={(e) => e.stopPropagation()}
          className="w-72 max-w-[calc(100vw-2rem)] p-3 text-sm break-words whitespace-pre-wrap"
        >
          {value}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
};
