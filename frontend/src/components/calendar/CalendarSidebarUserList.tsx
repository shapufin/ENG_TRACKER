import React from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./UserAvatar";
import { userDisplayName, teamLabel } from "./calendarSidebarUtils";
import type { User } from "@/types";
import type { WorkspaceUserGroup } from "./CalendarSidebar";

interface CalendarSidebarUserListProps {
  users: User[];
  visibleUsers: Set<number>;
  onToggleUser: (id: number) => void;
  onShowUserModal?: (id: number) => void;
  groupedUsers?: WorkspaceUserGroup[];
  remainingDaysByUser?: Map<number, number>;
  /** Every match, not just the rows currently rendered (the list is capped). */
  staffCount: number;
  onShowAll: () => void;
}

const UserRow: React.FC<{
  user: User;
  isVisible: boolean;
  onToggleUser: (id: number) => void;
  onShowUserModal?: (id: number) => void;
  remainingDaysByUser?: Map<number, number>;
}> = ({ user, isVisible, onToggleUser, onShowUserModal, remainingDaysByUser }) => {
  const name = userDisplayName(user);
  const team = teamLabel(user);
  const hasRemaining = remainingDaysByUser?.has(user.id);
  const remaining = remainingDaysByUser?.get(user.id);

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-1.5 rounded-lg border px-2 py-1.5 transition-all",
        isVisible
          ? "border-border/80 bg-card shadow-2xs"
          : "border-border/40 bg-muted/20 opacity-60"
      )}
    >
      <button
        type="button"
        onClick={() => onToggleUser(user.id)}
        className="hover:bg-accent/40 focus-visible:ring-ring/60 flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left transition focus-visible:ring-2 focus-visible:outline-hidden"
        aria-pressed={isVisible}
        aria-label={`${isVisible ? "Hide" : "Show"} ${name}`}
      >
        <UserAvatar
          size="xs"
          name={name}
          email={user.email}
          colorSeed={user.id}
          className="h-6 w-6 shrink-0 rounded-md text-xs"
        />
        <div className="min-w-0 flex-1">
          <div className="text-foreground truncate text-xs font-bold" title={name}>
            {name}
          </div>
          {team && (
            <div
              className="text-muted-foreground truncate font-mono text-xs tracking-wider uppercase"
              title={team}
            >
              {team}
            </div>
          )}
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {hasRemaining && (
          <span
            className="text-tone-success-text font-mono text-xs font-semibold"
            title={`${remaining} days remaining`}
          >
            {remaining}d remaining
          </span>
        )}
        {onShowUserModal && hasRemaining && (
          <button
            type="button"
            onClick={() => onShowUserModal(user.id)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 rounded p-0.5 transition-colors focus-visible:ring-1 focus-visible:outline-hidden"
            aria-label={`View ${name}`}
            title={`View balance for ${name}`}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export const CalendarSidebarUserList: React.FC<CalendarSidebarUserListProps> = ({
  users,
  visibleUsers,
  onToggleUser,
  onShowUserModal,
  groupedUsers,
  remainingDaysByUser,
  staffCount,
  onShowAll,
}) => {
  const heading = (
    <div className="border-border/60 flex shrink-0 items-center justify-between gap-1.5 border-b px-2.5 py-1">
      <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
        Staff ({staffCount})
      </span>
      <button
        type="button"
        onClick={onShowAll}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 rounded px-1 py-0.5 text-xs font-semibold transition focus-visible:ring-1 focus-visible:outline-hidden"
      >
        All members
      </button>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {heading}
      <div className="min-h-0 flex-1 space-y-1 overflow-auto p-2">
        {groupedUsers && groupedUsers.length > 0
          ? groupedUsers.map((group) => (
              <div key={group.workspaceId} className="space-y-1">
                <div className="flex items-center gap-1.5 px-2 pt-1 pb-0.5">
                  <span className="bg-primary block h-1.5 w-1.5 rounded-full" aria-hidden="true" />
                  <span
                    className="text-muted-foreground truncate text-xs font-bold tracking-wider uppercase"
                    title={group.workspaceName}
                  >
                    {group.workspaceName}
                  </span>
                  <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
                    {group.users.length}
                  </span>
                </div>
                {group.users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isVisible={visibleUsers.has(user.id)}
                    onToggleUser={onToggleUser}
                    onShowUserModal={onShowUserModal}
                    remainingDaysByUser={remainingDaysByUser}
                  />
                ))}
              </div>
            ))
          : users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isVisible={visibleUsers.has(user.id)}
                onToggleUser={onToggleUser}
                onShowUserModal={onShowUserModal}
                remainingDaysByUser={remainingDaysByUser}
              />
            ))}
      </div>
    </div>
  );
};
