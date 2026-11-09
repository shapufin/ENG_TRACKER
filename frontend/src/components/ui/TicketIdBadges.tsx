import React from "react";
import { Badge } from "@/components/ui/badge";

interface TicketIdBadgesProps {
  references?: string[];
  maxVisible?: number;
}

/**
 * Compact, responsive badge renderer for ticket reference lists (e.g. ["INC-100", "INC-102"]).
 * Renders up to `maxVisible` badges, plus a "+N" overflow badge with full list tooltip.
 * Prevents horizontal layout blowout on tables and mobile cards while keeping all tickets accessible.
 */
export const TicketIdBadges: React.FC<TicketIdBadgesProps> = ({ references, maxVisible = 2 }) => {
  if (!references || references.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  const fullList = references.join(", ");

  if (references.length === 1) {
    return (
      <Badge
        variant="outline"
        className="max-w-[140px] truncate font-mono text-xs font-normal whitespace-nowrap"
        title={references[0]}
      >
        {references[0]}
      </Badge>
    );
  }

  const visible = references.slice(0, maxVisible);
  const remaining = references.length - visible.length;

  return (
    <div className="inline-flex max-w-[180px] flex-wrap items-center gap-1" title={fullList}>
      {visible.map((ref) => (
        <Badge
          key={ref}
          variant="outline"
          className="px-1.5 py-0 font-mono text-[11px] font-normal whitespace-nowrap"
        >
          {ref}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge
          variant="secondary"
          className="px-1.5 py-0 font-mono text-[11px] font-normal whitespace-nowrap"
          title={`${remaining} more: ${references.slice(maxVisible).join(", ")}`}
        >
          +{remaining}
        </Badge>
      )}
    </div>
  );
};
