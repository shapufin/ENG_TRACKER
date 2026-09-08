/**
 * CRViewTabs — view-mode switcher for the Control Room dashboard.
 *
 * Four modes (overview removed — was messy/ugly per user feedback):
 *   this-week — 7-column strip of the current week (Mon→Sun)
 *   roster    — aggregated table, one row per person
 *   by-team   — one card per team, aggregated users inside
 *   by-day    — month calendar grid of who is on standby
 *
 * Thin wrapper around shadcn Tabs. No data fetching — purely presentational.
 */
import React from "react";
import { Users, CalendarDays, Table, CalendarRange } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type CRViewMode = "this-week" | "roster" | "by-team" | "by-day";

interface Props {
  value: CRViewMode;
  onChange: (mode: CRViewMode) => void;
}

const triggers: Array<{ value: CRViewMode; label: string; icon: typeof Users }> = [
  { value: "this-week", label: "This Week", icon: CalendarRange },
  { value: "roster", label: "Roster", icon: Table },
  { value: "by-team", label: "By Team", icon: Users },
  { value: "by-day", label: "By Day", icon: CalendarDays },
];

export const CRViewTabs: React.FC<Props> = ({ value, onChange }) => (
  <Tabs value={value} onValueChange={(v) => onChange(v as CRViewMode)}>
    <TabsList className="grid w-full grid-cols-4 bg-muted/50">
      {triggers.map(({ value: v, label, icon: Icon }) => (
        <TabsTrigger key={v} value={v} className="gap-2">
          <Icon className="h-4 w-4" />
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);
