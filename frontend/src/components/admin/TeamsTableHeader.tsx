import React from "react";
import { Checkbox } from "@/components/ui/checkbox";

interface TeamsTableHeaderProps {
  allSelected: boolean;
  onSelectAll: (checked: boolean) => void;
}

export const TeamsTableHeader: React.FC<TeamsTableHeaderProps> = ({ allSelected, onSelectAll }) => (
  <div className="grid grid-cols-[80px_2fr_1.5fr_1.5fr_1fr_1fr_120px] gap-4 border-b border-border/50 bg-muted/20 px-6 py-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
    <div>
      <Checkbox checked={allSelected} onCheckedChange={onSelectAll} className="border-primary/40" />
    </div>
    <div>Team</div>
    <div>Code</div>
    <div>Calendar Group</div>
    <div>Members</div>
    <div>Leader</div>
    <div>Actions</div>
  </div>
);
