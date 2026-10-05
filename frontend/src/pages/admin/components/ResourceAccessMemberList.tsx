import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { TABLE_HEAD_CELL_CLASS, TABLE_HEAD_ROW_CLASS } from "@/components/ui/tableStyles";
import { cn } from "@/lib/utils";
import { UserPlus, Trash2, X } from "lucide-react";
import type { UserGroup } from "@/types";

interface ResourceAccessMemberListProps {
  members: UserGroup[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  memberSearch: string;
  memberPage: number;
  memberTotal: number;
  memberTotalPages: number;
  groupName?: string;
  onRetry: () => void;
  onClearSearch: () => void;
  onAdd: () => void;
  onPageChange: (page: number) => void;
  onRemove: (membership: UserGroup) => void;
}

export function ResourceAccessMemberList({
  members,
  isLoading,
  isFetching,
  isError,
  memberSearch,
  memberPage,
  memberTotal,
  memberTotalPages,
  groupName,
  onRetry,
  onClearSearch,
  onAdd,
  onPageChange,
  onRemove,
}: ResourceAccessMemberListProps) {
  if (isLoading) return <LoadingCard title="Loading members" rows={4} className="min-h-[160px]" />;
  if (isError) {
    return (
      <ErrorCard
        title="Couldn't load members"
        message="Refresh the page and try again."
        onRetry={onRetry}
      />
    );
  }
  if (members.length === 0) {
    return (
      <GlassCard isHoverLift={false}>
        <EmptyState
          icon={UserPlus}
          title={memberSearch ? "No members match your search" : "No members yet"}
          description={
            memberSearch
              ? "Try a different search term or clear the search."
              : "Add people to this group to grant them the group's plugin capabilities."
          }
          action={
            memberSearch ? (
              <Button variant="outline" onClick={onClearSearch}>
                <X className="mr-2 h-4 w-4" />
                Clear search
              </Button>
            ) : (
              <Button onClick={onAdd}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add first member
              </Button>
            )
          }
        />
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-0" isHoverLift={false}>
      <div className="hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className={TABLE_HEAD_ROW_CLASS}>
              <th className={TABLE_HEAD_CELL_CLASS}>Member</th>
              <th className={TABLE_HEAD_CELL_CLASS}>Username</th>
              <th className={cn(TABLE_HEAD_CELL_CLASS, "text-right")}>Action</th>
            </tr>
          </thead>
          <tbody>
            {members.map((membership) => (
              <tr
                key={membership.id}
                className="border-border/40 hover:bg-table-hover border-b transition-colors last:border-0"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-secondary text-secondary-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                      {(membership.user_name || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-foreground font-medium">
                      {membership.user_name || "Unknown user"}
                    </span>
                  </div>
                </td>
                <td className="text-muted-foreground px-4 py-3">{membership.user_name}</td>
                <td className="px-4 py-3 text-right">
                  <RemoveButton membership={membership} groupName={groupName} onRemove={onRemove} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-border/40 divide-y md:hidden">
        {members.map((membership) => (
          <div key={membership.id} className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className="bg-secondary text-secondary-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {(membership.user_name || "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-medium"
                  title={membership.user_name || "Unknown user"}
                >
                  {membership.user_name || "Unknown user"}
                </p>
                <p className="text-muted-foreground truncate text-xs" title={membership.user_name}>
                  {membership.user_name}
                </p>
              </div>
            </div>
            <RemoveButton membership={membership} groupName={groupName} onRemove={onRemove} />
          </div>
        ))}
      </div>
      {memberTotalPages > 1 && (
        <div className="border-border/60 text-muted-foreground flex items-center justify-between gap-3 border-t px-4 py-3 text-xs">
          <span>
            Page {memberPage} of {memberTotalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={memberPage <= 1 || isFetching}
              onClick={() => onPageChange(memberPage - 1)}
              aria-label="Previous page"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={memberPage >= memberTotalPages || isFetching}
              onClick={() => onPageChange(memberPage + 1)}
              aria-label="Next page"
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <span className="sr-only">{memberTotal} total members</span>
    </GlassCard>
  );
}

function RemoveButton({
  membership,
  groupName,
  onRemove,
}: {
  membership: UserGroup;
  groupName?: string;
  onRemove: (membership: UserGroup) => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0"
      aria-label={`Remove ${membership.user_name || "this person"} from ${groupName}`}
      onClick={() => onRemove(membership)}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
