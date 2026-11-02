import React from "react";
import { ChevronRight, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./UserAvatar";
import { userDisplayName } from "./calendarSidebarUtils";
import type { VacationBalanceBreakdown } from "@/lib/vacation-balance";
import type { User } from "@/types";

interface CollapsedCalendarSidebarProps {
  users: User[];
  visibleUsers: Set<number>;
  onToggleUser: (id: number) => void;
  onExpand: () => void;
  snapshotSummary?: VacationBalanceBreakdown | null;
  onShowSnapshotModal?: () => void;
}

export const CollapsedCalendarSidebar: React.FC<CollapsedCalendarSidebarProps> = ({
  users,
  visibleUsers,
  onToggleUser,
  onExpand,
  snapshotSummary,
  onShowSnapshotModal,
}) => (
  <aside className="border-border/70 bg-card/60 text-foreground flex h-full min-h-0 flex-col items-center gap-3 rounded-2xl border p-2">
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="border-border/60 bg-background/40 h-8 w-8 rounded-lg border"
      onClick={onExpand}
      aria-label="Expand team sidebar"
    >
      <ChevronRight className="h-4 w-4" />
    </Button>
    {snapshotSummary && (
      <button
        type="button"
        onClick={onShowSnapshotModal}
        className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 flex h-9 w-9 flex-col items-center justify-center rounded-xl border transition-colors"
        title={`My Vacation: ${snapshotSummary.remainingDays}d remaining`}
        aria-label="View vacation balance"
      >
        <Plane className="h-3.5 w-3.5" />
        <span className="font-mono text-xs font-bold">
          {Math.round(snapshotSummary.remainingDays)}d
        </span>
      </button>
    )}
    <div className="flex w-full flex-1 flex-col items-center gap-2 overflow-auto pb-4">
      {users.map((user) => {
        const name = userDisplayName(user);
        const isVisible = visibleUsers.has(user.id);
        return (
          <button
            key={user.id}
            type="button"
            onClick={() => onToggleUser(user.id)}
            className={cn(
              "relative flex items-center justify-center rounded-full border p-0.5 transition",
              isVisible ? "border-primary/80" : "border-border/70 hover:border-border/80"
            )}
            title={name}
          >
            <UserAvatar size="xs" name={name} email={user.email} colorSeed={user.id} />
          </button>
        );
      })}
    </div>
    <div className="text-muted-foreground text-xs tracking-[0.3em] uppercase">Team</div>
  </aside>
);
