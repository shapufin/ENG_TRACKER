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
        "flex w-full items-center gap-2 rounded-xl border px-2 py-1.5 transition",
        isVisible
          ? "border-primary/60 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]"
          : "border-line-subtle bg-card-raised"
      )}
    >
      <button
        type="button"
        onClick={() => onToggleUser(user.id)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left transition hover:bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        aria-pressed={isVisible}
        aria-label={`${isVisible ? "Hide" : "Show"} ${name}`}
      >
        <UserAvatar size="xs" name={name} email={user.email} colorSeed={user.id} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold text-foreground" title={name}>
            {name}
          </span>
          <span
            className="block truncate text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
            title={teamLabel(user)}
          >
            {teamLabel(user)}
          </span>
          {remainingDaysByUser?.has(user.id) && (
            <span
              className="block truncate font-mono text-[9px] font-medium text-emerald-700 dark:text-emerald-400"
              title={`${remainingDaysByUser.get(user.id)} days remaining`}
            >
              {remainingDaysByUser.get(user.id)}d remaining
            </span>
          )}
        </span>
      </button>
      {onShowUserModal && (
        <button
          type="button"
          onClick={() => onShowUserModal(user.id)}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
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
}) => {
  if (groupedUsers && groupedUsers.length > 0) {
    return (
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-2">
        {groupedUsers.map((group) => (
          <div key={group.workspaceId} className="space-y-1">
            <div className="sticky top-0 z-10 flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1 backdrop-blur-sm">
              <span className="block h-2 w-2 rounded-full bg-primary" />
              <span
                className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                title={group.workspaceName}
              >
                {group.workspaceName}
              </span>
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
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
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-1 overflow-auto p-2">
      {users.map((user) => (
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
  );
};
