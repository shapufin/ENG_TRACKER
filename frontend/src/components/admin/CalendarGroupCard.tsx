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
    <GlassCard isHoverLift={false} glow="primary" className="p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <svg
              className="h-8 w-8 text-primary"
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
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Shared Calendar
            </p>

            <h3 className="mt-1 text-3xl font-semibold">{groupName}</h3>

            <p className="mt-2 text-sm text-muted-foreground">
              {teamCount} team{teamCount !== 1 ? "s" : ""} currently connected
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11 rounded-xl border-border bg-muted/30"
            onClick={onManageTeams}
            title="Manage teams in this group"
          >
            <Users className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11 rounded-xl border-border bg-muted/30"
            onClick={onEdit}
            title="Rename group"
          >
            <Edit3 className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11 rounded-xl border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
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
