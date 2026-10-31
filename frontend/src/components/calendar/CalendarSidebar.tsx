import React, { useMemo, useState } from "react";
import { CollapsedCalendarSidebar } from "./CollapsedCalendarSidebar";
import { CalendarSidebarHeader } from "./CalendarSidebarHeader";
import { CalendarSidebarFacets } from "./CalendarSidebarFacets";
import { matchingUserIds, NO_FACETS, type FacetSelection } from "./calendarFacets";
import { CalendarSidebarUserList } from "./CalendarSidebarUserList";
import { CalendarSidebarFooter } from "./CalendarSidebarFooter";
import { userDisplayName, teamLabel } from "./calendarSidebarUtils";
import type { User } from "@/types";

export interface WorkspaceUserGroup {
  workspaceId: number;
  workspaceName: string;
  users: User[];
}

interface CalendarSidebarProps {
  allUsers: User[];
  visibleUsers: Set<number>;
  onToggleUser: (id: number) => void;
  onClearUsers: () => void;
  /** Show exactly these people (used by the client/tech chips). */
  onSetUsers?: (ids: number[]) => void;
  showStandby: boolean;
  showVacation: boolean;
  showSick: boolean;
  onToggleType: (type: "standby" | "vacation" | "sick") => void;
  calendarGroup?: string;
  onShowUserModal?: (id: number) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  groupedUsers?: WorkspaceUserGroup[];
  remainingDaysByUser?: Map<number, number>;
}

export const CalendarSidebar: React.FC<CalendarSidebarProps> = ({
  allUsers,
  visibleUsers,
  onToggleUser,
  onClearUsers,
  onSetUsers,
  showStandby,
  showVacation,
  showSick,
  onToggleType,
  calendarGroup,
  onShowUserModal,
  collapsed = false,
  onToggleCollapse,
  groupedUsers,
  remainingDaysByUser,
}) => {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  // The visible set resets whenever the people change (another workspace): so must the chips.
  // The selection remembers which people it was made for and reads as empty for any other set.
  const peopleKey = allUsers.map((user) => user.id).join("|");
  const [facetState, setFacetState] = useState({ peopleKey, selection: NO_FACETS });
  const facets = facetState.peopleKey === peopleKey ? facetState.selection : NO_FACETS;
  const setFacets = (selection: FacetSelection) => setFacetState({ peopleKey, selection });

  const applyFacets = (next: FacetSelection) => {
    setFacets(next);
    const ids = matchingUserIds(allUsers, next);
    if (ids === null) onClearUsers();
    else onSetUsers?.(ids);
  };

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return allUsers;
    return allUsers.filter((user) => {
      const name = userDisplayName(user);
      return [name, user.username, user.email, teamLabel(user)]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [allUsers, query]);

  const filteredGroups = useMemo(() => {
    if (!groupedUsers) return undefined;
    const needle = query.trim().toLowerCase();
    return groupedUsers.map((group) => ({
      ...group,
      users: needle
        ? group.users.filter((user) => {
            const name = userDisplayName(user);
            return [name, user.username, user.email, teamLabel(user)]
              .filter(Boolean)
              .some((value) => value?.toLowerCase().includes(needle));
          })
        : group.users,
    }));
  }, [groupedUsers, query]);

  const visibleList = expanded ? filteredUsers : filteredUsers.slice(0, 8);
  const hiddenCount = Math.max(0, filteredUsers.length - visibleList.length);
  // A client and tech that no single person has together empties the calendar; say why.
  const matchedIds = matchingUserIds(allUsers, facets);
  const noMatches = matchedIds !== null && matchedIds.length === 0;

  if (collapsed) {
    return (
      <CollapsedCalendarSidebar
        users={visibleList}
        visibleUsers={visibleUsers}
        onToggleUser={onToggleUser}
        onExpand={onToggleCollapse || (() => {})}
      />
    );
  }

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-xl">
      <CalendarSidebarHeader
        userCount={allUsers.length}
        calendarGroup={calendarGroup}
        query={query}
        onQueryChange={setQuery}
        onCollapse={onToggleCollapse || (() => {})}
        onClearUsers={() => {
          setQuery("");
          setExpanded(false);
          setFacets(NO_FACETS);
          onClearUsers();
        }}
      />
      <CalendarSidebarFacets users={allUsers} selection={facets} onChange={applyFacets} />
      {noMatches && (
        <p className="text-muted-foreground px-3 pb-2 text-xs">No one matches these filters.</p>
      )}
      <CalendarSidebarUserList
        users={visibleList}
        visibleUsers={visibleUsers}
        onToggleUser={onToggleUser}
        onShowUserModal={onShowUserModal}
        groupedUsers={filteredGroups}
        remainingDaysByUser={remainingDaysByUser}
      />
      <CalendarSidebarFooter
        hiddenCount={hiddenCount}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((prev) => !prev)}
        showStandby={showStandby}
        showVacation={showVacation}
        showSick={showSick}
        onToggleType={onToggleType}
      />
    </aside>
  );
};
