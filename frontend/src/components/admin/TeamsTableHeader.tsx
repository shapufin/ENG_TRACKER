import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { TABLE_HEAD_GRID_CLASS } from "@/components/ui/tableStyles";
import { cn } from "@/lib/utils";

interface TeamsTableHeaderProps {
  allSelected: boolean;
  onSelectAll: (checked: boolean) => void;
}

export const TeamsTableHeader: React.FC<TeamsTableHeaderProps> = ({ allSelected, onSelectAll }) => (
  <div className={cn("grid grid-cols-[80px_2fr_1.5fr_1.5fr_1fr_1fr_120px]", TABLE_HEAD_GRID_CLASS)}>
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
