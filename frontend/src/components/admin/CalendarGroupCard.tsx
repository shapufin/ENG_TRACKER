import React from "react";
import { Edit3, Trash2, Users } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";

interface CalendarGroupCardProps {
  groupName: string;
  teamCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onManageTeams: () => void;
}

export const CalendarGroupCard: React.FC<CalendarGroupCardProps> = ({
  groupName,
  teamCount,
  onEdit,
  onDelete,
  onManageTeams,
}) => {
  return (
    <GlassCard glow="primary" className="p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
            <svg
              className="text-primary h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>

          <div>
            <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
              Shared Calendar
            </p>

            <h3 className="mt-0.5 text-lg font-semibold">{groupName}</h3>

            <p className="text-muted-foreground mt-1 text-xs">
              {teamCount} team{teamCount !== 1 ? "s" : ""} currently connected
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="icon"
            variant="outline"
            className="border-border bg-muted/30 h-9 w-9 rounded-lg"
            onClick={onManageTeams}
            title="Manage teams in this group"
          >
            <Users className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="outline"
            className="border-border bg-muted/30 h-9 w-9 rounded-lg"
            onClick={onEdit}
            title="Rename group"
          >
            <Edit3 className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="outline"
            className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 h-9 w-9 rounded-lg"
            onClick={onDelete}
            title="Delete group"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </GlassCard>
  );
};
