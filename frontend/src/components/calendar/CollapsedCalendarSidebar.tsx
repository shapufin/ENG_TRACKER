import React from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./UserAvatar";
import { userDisplayName } from "./calendarSidebarUtils";
import type { User } from "@/types";

interface CollapsedCalendarSidebarProps {
  users: User[];
  visibleUsers: Set<number>;
  onToggleUser: (id: number) => void;
  onExpand: () => void;
}

export const CollapsedCalendarSidebar: React.FC<CollapsedCalendarSidebarProps> = ({
  users,
  visibleUsers,
  onToggleUser,
  onExpand,
}) => (
  <aside className="flex h-full min-h-0 flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-2 text-foreground">
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-8 w-8 rounded-lg border border-border/60 bg-background/40"
      onClick={onExpand}
      aria-label="Expand team sidebar"
    >
      <ChevronRight className="h-4 w-4" />
    </Button>
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
    <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Team</div>
  </aside>
);
