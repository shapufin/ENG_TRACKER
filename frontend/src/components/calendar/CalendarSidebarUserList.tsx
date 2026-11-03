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
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 transition",
        isVisible
          ? "border-primary/60 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]"
          : "border-line-subtle bg-card-raised"
      )}
    >
      <button
        type="button"
        onClick={() => onToggleUser(user.id)}
        className="hover:bg-background/40 focus-visible:ring-ring/60 flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left transition focus-visible:ring-2 focus-visible:outline-hidden"
        aria-pressed={isVisible}
        aria-label={`${isVisible ? "Hide" : "Show"} ${name}`}
      >
        <UserAvatar size="xs" name={name} email={user.email} colorSeed={user.id} />
        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-xs font-semibold" title={name}>
            {name}
          </span>
          <span
            className="text-muted-foreground block truncate text-xs font-medium tracking-wide uppercase"
            title={teamLabel(user)}
          >
            {teamLabel(user)}
          </span>
          {remainingDaysByUser?.has(user.id) && (
            <span
              className="text-tone-success-text block truncate font-mono text-xs font-medium"
              title={`${remainingDaysByUser.get(user.id)} days remaining`}
            >
              {remainingDaysByUser.get(user.id)}d remaining
            </span>
          )}
        </span>
      </button>
      {/* Balances are only readable by leaders; for everyone else the button opens an empty modal. */}
      {onShowUserModal && remainingDaysByUser?.has(user.id) && (
        <button
          type="button"
          onClick={() => onShowUserModal(user.id)}
          className="text-muted-foreground hover:bg-background/60 hover:text-foreground focus-visible:ring-ring/60 rounded-md p-1 transition focus-visible:ring-2 focus-visible:outline-hidden"
          aria-label={`View ${name}`}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      )}
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
    <div className="border-border/60 flex shrink-0 items-center justify-between gap-2 border-b px-2.5 py-1.5">
      <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        Staff ({staffCount})
      </span>
      <button
        type="button"
        onClick={onShowAll}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 rounded-md px-1 py-0.5 text-xs font-medium transition focus-visible:ring-1 focus-visible:outline-hidden"
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
                <div className="bg-card/95 sticky top-0 z-10 flex items-center gap-2 px-2 py-1 backdrop-blur-sm">
                  <span className="bg-primary block h-2 w-2 rounded-full" aria-hidden="true" />
                  <span
                    className="text-muted-foreground truncate text-xs font-semibold tracking-wide uppercase"
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
