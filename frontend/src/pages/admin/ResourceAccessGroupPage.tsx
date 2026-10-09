import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight, Pencil, UserPlus, UsersRound } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { SearchField } from "@/components/ui/SearchField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ResourceAccessGroupDialog } from "./components/ResourceAccessGroupDialog";
import { ResourceAccessMemberDialog } from "./components/ResourceAccessMemberDialog";
import { ResourceAccessMemberList } from "./components/ResourceAccessMemberList";
import { useResourceGroupDetail } from "./hooks/useResourceGroupDetail";
import { extractApiErrorMessage } from "@/lib/apiFormError";

const DEFAULT_MEMBER_PAGE_SIZE = 25;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function ResourceAccessGroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const groupIdNum = Number(groupId);
  const memberSearch = searchParams.get("member_search") ?? "";
  const memberPage = clamp(Number(searchParams.get("member_page") ?? "1"), 1, 10_000);
  const memberPageSize = clamp(
    Number(searchParams.get("member_page_size") ?? String(DEFAULT_MEMBER_PAGE_SIZE)),
    1,
    100
  );

  const { group, members, addMember, removeMember, updateGroup } = useResourceGroupDetail({
    groupId: groupIdNum,
    memberSearch,
    memberPage,
    memberPageSize,
  });

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addErrorMessage, setAddErrorMessage] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{
    id: number;
    label: string;
  } | null>(null);

  const setMemberSearch = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          if (value) prev.set("member_search", value);
          else prev.delete("member_search");
          prev.delete("member_page");
          return prev;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setMemberPage = useCallback(
    (value: number) => {
      setSearchParams(
        (prev) => {
          prev.set("member_page", String(value));
          return prev;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const clearMemberSearch = useCallback(() => {
    setSearchParams(
      (prev) => {
        prev.delete("member_search");
        prev.delete("member_page");
        return prev;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const groupData = group.data;
  const memberList = members.data?.results ?? [];
  const memberTotal = members.data?.count ?? 0;
  const memberTotalPages = Math.max(1, Math.ceil(memberTotal / memberPageSize));

  const detailState = useMemo(() => {
    if (group.isLoading && !group.data) return "loading" as const;
    // `== null` catches both null (404 response) and undefined (query disabled
    // because groupId is NaN or invalid).
    if (group.isError || group.data == null) return "error" as const;
    return "ready" as const;
  }, [group.isLoading, group.data, group.isError]);

  const handleAdd = (userId: number) => {
    setAddErrorMessage(null);
    addMember.mutate(
      { user: userId, group: groupIdNum },
      {
        onSuccess: () => setAddDialogOpen(false),
        onError: (err) => {
          setAddErrorMessage(extractApiErrorMessage(err, "Could not add the member."));
        },
      }
    );
  };

  const handleRemove = () => {
    if (!memberToRemove) return;
    removeMember.mutate(memberToRemove.id, {
      onSuccess: () => setMemberToRemove(null),
    });
  };

  const handleEdit = (values: { name: string; code: string; description: string }) => {
    setEditErrorMessage(null);
    updateGroup.mutate(
      { id: groupIdNum, payload: values },
      {
        onSuccess: () => setEditDialogOpen(false),
        onError: (err) => {
          setEditErrorMessage(extractApiErrorMessage(err, "Could not update the group."));
        },
      }
    );
  };

  if (detailState === "loading") {
    return (
      <PageShell title="Group" subtitle="Loading group details">
        <LoadingCard title="Loading group" rows={5} className="min-h-[200px]" />
      </PageShell>
    );
  }

  if (detailState === "error") {
    return (
      <PageShell title="Group" subtitle="Group not found">
        <ErrorCard
          title="Group not found"
          message="This group may have been removed or you may not have access to view it."
          onRetry={() => navigate("/admin/resource-access")}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      category="Governance"
      title={groupData?.name ?? "Group"}
      subtitle={groupData?.description || "Manage group membership"}
    >
      {/* Breadcrumb */}
      <nav
        className="text-muted-foreground flex items-center gap-1 text-sm"
        aria-label="Breadcrumb"
      >
        <button
          className="hover:text-foreground transition-colors"
          onClick={() => navigate("/admin/resource-access")}
        >
          Resource access
        </button>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">{groupData?.name}</span>
      </nav>

      {/* Group header */}
      <GlassCard className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="bg-primary/10 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
              <UsersRound className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">{groupData?.name}</h2>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {groupData?.code}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {groupData?.member_count ?? 0} members
                </Badge>
              </div>
              {groupData?.description && (
                <p className="text-muted-foreground max-w-2xl text-sm leading-6">
                  {groupData.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit group
            </Button>
            <Button onClick={() => setAddDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add member
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Member toolbar */}
      <GlassCard className="p-4">
        <FilterToolbar>
          <FilterToolbar.Search>
            <SearchField
              placeholder="Search members by name or username..."
              value={memberSearch}
              onChange={setMemberSearch}
              onClear={clearMemberSearch}
              aria-label="Search members"
            />
          </FilterToolbar.Search>
          <span className="text-muted-foreground shrink-0 text-xs">
            {memberTotal} {memberTotal === 1 ? "member" : "members"}
          </span>
        </FilterToolbar>
      </GlassCard>

      {/* Member list */}
      <ResourceAccessMemberList
        members={memberList}
        isLoading={members.isLoading && !members.data}
        isFetching={members.isFetching}
        isError={members.isError}
        memberSearch={memberSearch}
        memberPage={memberPage}
        memberTotal={memberTotal}
        memberTotalPages={memberTotalPages}
        groupName={groupData?.name}
        onRetry={() => void members.refetch()}
        onClearSearch={clearMemberSearch}
        onAdd={() => setAddDialogOpen(true)}
        onPageChange={setMemberPage}
        onRemove={(membership) =>
          setMemberToRemove({ id: membership.id, label: membership.user_name || "this person" })
        }
      />

      {/* Add member dialog */}
      <ResourceAccessMemberDialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) setAddErrorMessage(null);
        }}
        groupId={groupIdNum}
        groupName={groupData?.name ?? "group"}
        onAdd={handleAdd}
        isPending={addMember.isPending}
        errorMessage={addErrorMessage}
      />

      {/* Edit group dialog */}
      <ResourceAccessGroupDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditErrorMessage(null);
        }}
        editingGroup={groupData ?? null}
        onSubmit={handleEdit}
        isPending={updateGroup.isPending}
        errorMessage={editErrorMessage}
      />

      {/* Remove confirmation */}
      <ConfirmDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
        title="Remove membership?"
        description={`This will remove ${memberToRemove?.label ?? "this person"} from ${groupData?.name ?? "this group"}.`}
        onConfirm={handleRemove}
      />
    </PageShell>
  );
}
