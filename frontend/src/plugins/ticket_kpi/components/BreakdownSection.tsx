import React from "react";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { RankedBars } from "./RankedBars";

export type StatusGroupFilter = "open" | "closed" | "cancelled" | "other";

export interface BreakdownData {
  has_data: boolean;
  by_category: Record<string, number>;
  by_priority: Record<string, number>;
  by_status: Record<string, number>;
  clients: { id: number; name: string }[];
}

interface BreakdownSectionProps {
  data: BreakdownData | undefined;
  group: StatusGroupFilter | null;
  clientId: number | null;
  onGroupChange: (group: StatusGroupFilter | null) => void;
  onClientChange: (clientId: number | null) => void;
}

const GROUPS: { value: StatusGroupFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "other", label: "Other" },
];

/**
 * Status, priority and category for the selected month. The filters sit in
 * this section on purpose: they narrow these three lists only, not the totals
 * above, and the helper line says so.
 */
export const BreakdownSection: React.FC<BreakdownSectionProps> = ({
  data,
  group,
  clientId,
  onGroupChange,
  onClientChange,
}) => {
  const clients = data?.clients ?? [];
  const filtered = group !== null || clientId !== null;
  return (
    <section aria-labelledby="ticket-breakdown-title" className="@container space-y-4">
      <div className="space-y-2">
        <div>
          <h3 id="ticket-breakdown-title" className="text-lg font-semibold">
            Where the tickets went
          </h3>
          <p className="text-muted-foreground text-xs">
            {filtered
              ? "Filtered. The totals above still cover the whole month."
              : "Every ticket of the month, grouped three ways."}
          </p>
        </div>
        <FilterChipRow<StatusGroupFilter>
          label="Status"
          options={GROUPS}
          selected={group ? [group] : []}
          onToggle={(value) => onGroupChange(value === group ? null : value)}
        />
        {clients.length > 1 && (
          <FilterChipRow<string>
            label="Client"
            options={clients.map((c) => ({ value: String(c.id), label: c.name }))}
            selected={clientId !== null ? [String(clientId)] : []}
            onToggle={(value) => onClientChange(Number(value) === clientId ? null : Number(value))}
          />
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
        <RankedBars
          title="Status"
          data={data?.by_status ?? {}}
          tone={1}
          emptyText="No tickets with this filter."
        />
        <RankedBars
          title="Priority"
          data={data?.by_priority ?? {}}
          tone={3}
          emptyText="No tickets with this filter."
        />
        <RankedBars
          title="Category"
          data={data?.by_category ?? {}}
          tone={2}
          emptyText="No tickets with this filter."
        />
      </div>
    </section>
  );
};
