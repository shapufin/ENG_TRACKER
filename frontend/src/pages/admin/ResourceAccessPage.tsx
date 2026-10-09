import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  KeyRound,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  TABLE_HEAD_CELL_CHECKBOX_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
} from "@/components/ui/tableStyles";
import { cn } from "@/lib/utils";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { SearchField } from "@/components/ui/SearchField";
import { ResourceAccessGroupDialog } from "./components/ResourceAccessGroupDialog";
import { useResourceAccessDirectory } from "./hooks/useResourceAccessDirectory";
import { extractApiErrorMessage } from "@/lib/apiFormError";

export function ResourceAccessPage() {
  const navigate = useNavigate();
  const {
    search,
    page,
    totalPages,
    groups,
    createGroup,
    bulkDeleteGroups,
    directoryState,
    totalCount,
    setSearch,
    setPage,
    clearSearch,
  } = useResourceAccessDirectory();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const groupResults = groups.data?.results;
  const groupList = useMemo(() => groupResults ?? [], [groupResults]);
  const selectedGroups = useMemo(
    () => groupList.filter((group) => selectedGroupIds.has(group.id)),
    [groupList, selectedGroupIds]
  );
  const selectedPluginAccess = useMemo(() => {
    const access = new Map<string, { plugin_name: string; actions: Set<string> }>();
    selectedGroups.forEach((group) => {
      group.plugin_access?.forEach(({ plugin_name, action }) => {
        const entry = access.get(plugin_name) ?? { plugin_name, actions: new Set<string>() };
        entry.actions.add(action);
        access.set(plugin_name, entry);
      });
    });
    return Array.from(access.values()).sort((a, b) => a.plugin_name.localeCompare(b.plugin_name));
  }, [selectedGroups]);

  const selectedCount = selectedGroups.length;
  const allVisibleSelected =
    groupList.length > 0 && groupList.every((group) => selectedGroupIds.has(group.id));

  const toggleGroup = (groupId: number, checked: boolean) => {
    setSelectedGroupIds((current) => {
      const next = new Set(current);
      if (checked) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedGroupIds((current) => {
      const next = new Set(current);
      groupList.forEach((group) => (checked ? next.add(group.id) : next.delete(group.id)));
      return next;
    });
  };

  const handleBulkDelete = () => {
    const ids = selectedGroups.map((group) => group.id);
    if (ids.length === 0) return;
    bulkDeleteGroups.mutate(ids, {
      onSuccess: () => {
        setSelectedGroupIds(new Set());
        setBulkDeleteOpen(false);
      },
    });
  };

  const handleCreate = (values: { name: string; code: string; description: string }) => {
    setMutationError(null);
    createGroup.mutate(values, {
      onSuccess: () => setDialogOpen(false),
      onError: (err) => {
        setMutationError(extractApiErrorMessage(err, "Could not create the group."));
      },
    });
  };

  if (directoryState === "loading") {
    return (
      <PageShell
        category="Governance"
        title="Resource access"
        subtitle="Manage groups used for plugin and resource access"
      >
        <LoadingCard title="Loading resource access" rows={7} className="min-h-[280px]" />
      </PageShell>
    );
  }

  if (directoryState === "error") {
    return (
      <PageShell
        category="Governance"
        title="Resource access"
        subtitle="Manage groups used for plugin and resource access"
      >
        <ErrorCard
          title="We couldn't load resource access"
          message="Refresh the page and try again. Your existing access assignments were not changed."
          onRetry={() => void groups.refetch()}
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      category="Governance"
      title="Resource access"
      subtitle="Create focused access groups and assign people without changing their roles."
      actions={
        <Badge variant="outline" className="gap-2 px-3 py-1.5 text-xs">
          <ShieldCheck className="text-primary h-3.5 w-3.5" />
          Superuser controls
        </Badge>
      }
    >
      {/* Summary metrics */}
      <GlassCard className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <p className="text-foreground text-sm font-medium">Least-privilege access</p>
              <p className="text-muted-foreground max-w-xl text-xs leading-5">
                Groups add plugin capabilities to specific people. They never change a user&apos;s
                role, shell, or Control Room scope.
              </p>
            </div>
          </div>
          <dl className="flex gap-8">
            <div>
              <dt className="text-muted-foreground text-xs font-medium">Groups</dt>
              <dd className="text-2xl font-semibold tracking-tight tabular-nums">{totalCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium">Memberships</dt>
              <dd className="text-2xl font-semibold tracking-tight tabular-nums">
                {groupList.reduce((sum, g) => sum + (g.member_count ?? 0), 0)}
              </dd>
            </div>
          </dl>
        </div>
      </GlassCard>

      {/* Toolbar + directory table / states: one card */}
      <GlassCard className="p-0">
        <div className="border-line-subtle border-b p-4">
          <FilterToolbar>
            <FilterToolbar.Search>
              <SearchField
                placeholder="Search by name or code..."
                value={search}
                onChange={setSearch}
                onClear={clearSearch}
                aria-label="Search groups"
              />
            </FilterToolbar.Search>
            <FilterToolbar.Group>
              {selectedCount > 0 && (
                <Button
                  variant="destructive"
                  size="control"
                  onClick={() => setBulkDeleteOpen(true)}
                  aria-label={`Delete ${selectedCount} selected group${selectedCount === 1 ? "" : "s"}`}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete selected ({selectedCount})
                </Button>
              )}
              <Button size="control" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create group
              </Button>
            </FilterToolbar.Group>
          </FilterToolbar>
        </div>
        {directoryState === "empty-system" ? (
          <EmptyState
            icon={Layers3}
            title="No access groups yet"
            description="Create a group to start assigning plugin capabilities to people."
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create your first group
              </Button>
            }
          />
        ) : directoryState === "empty-search" ? (
          <EmptyState
            icon={Search}
            title="No groups match your search"
            description={`No groups found for "${search}". Try a different term or clear the search.`}
            action={
              <Button variant="outline" onClick={clearSearch}>
                <X className="mr-2 h-4 w-4" />
                Clear search
              </Button>
            }
          />
        ) : directoryState === "out-of-range" ? (
          <EmptyState
            icon={Layers3}
            title="Page out of range"
            description={`Page ${page} has no groups. There ${totalPages === 1 ? "is" : "are"} ${totalPages} ${totalPages === 1 ? "page" : "pages"} of groups.`}
            action={
              <Button variant="outline" onClick={() => setPage(1)}>
                Back to page 1
              </Button>
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASS}>
                    <th className={cn(TABLE_HEAD_CELL_CHECKBOX_CLASS, "w-12")}>
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                        aria-label="Select all visible groups"
                      />
                    </th>
                    <th className={TABLE_HEAD_CELL_CLASS}>Name</th>
                    <th className={TABLE_HEAD_CELL_CLASS}>Code</th>
                    <th className={TABLE_HEAD_CELL_CLASS}>Members</th>
                    <th className={cn(TABLE_HEAD_CELL_CLASS, "text-right")}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {groupList.map((group) => (
                    <tr
                      key={group.id}
                      className={`border-border/40 hover:bg-table-hover border-b transition-colors last:border-0 ${
                        selectedGroupIds.has(group.id) ? "ring-primary/20 ring-1" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedGroupIds.has(group.id)}
                          onCheckedChange={(checked) => toggleGroup(group.id, checked === true)}
                          aria-label={`Select ${group.name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                            <UsersRound className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-foreground truncate font-medium" title={group.name}>
                              {group.name}
                            </p>
                            {group.description && (
                              <p
                                className="text-muted-foreground truncate text-xs"
                                title={group.description}
                              >
                                {group.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">
                          {group.code}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium tabular-nums">{group.member_count ?? 0}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => navigate(`/admin/resource-access/groups/${group.id}`)}
                          aria-label={`Manage ${group.name}`}
                        >
                          Manage
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile stacked cards */}
            <div className="divide-border/40 divide-y md:hidden">
              {groupList.map((group) => (
                <div
                  key={group.id}
                  className={`p-4 ${selectedGroupIds.has(group.id) ? "ring-primary/20 ring-1" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedGroupIds.has(group.id)}
                        onCheckedChange={(checked) => toggleGroup(group.id, checked === true)}
                        aria-label={`Select ${group.name}`}
                        className="mt-2"
                      />
                      <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                        <UsersRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-foreground truncate font-medium" title={group.name}>
                          {group.name}
                        </p>
                        <p className="text-muted-foreground truncate text-xs" title={group.code}>
                          {group.code}
                        </p>
                        {group.description && (
                          <p
                            className="text-muted-foreground mt-1 truncate text-xs"
                            title={group.description}
                          >
                            {group.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {group.member_count ?? 0} members
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 w-full gap-1"
                    onClick={() => navigate(`/admin/resource-access/groups/${group.id}`)}
                    aria-label={`Manage ${group.name}`}
                  >
                    Manage
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Pagination footer */}
            {totalPages > 1 && (
              <div className="border-border/60 text-muted-foreground flex items-center justify-between gap-3 border-t px-4 py-3 text-xs">
                <span>
                  Page {page} of {totalPages}
                  {totalCount > 0 && ` · ${totalCount} groups`}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || groups.isFetching}
                    onClick={() => setPage(page - 1)}
                    aria-label="Previous page"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || groups.isFetching}
                    onClick={() => setPage(page + 1)}
                    aria-label="Next page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </GlassCard>

      <ResourceAccessGroupDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setMutationError(null);
        }}
        onSubmit={handleCreate}
        isPending={createGroup.isPending}
        errorMessage={mutationError}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selectedCount} selected group${selectedCount === 1 ? "" : "s"}?`}
        description="This permanently removes the groups, their memberships, and their group-based plugin access grants. Existing user roles are not changed."
        onConfirm={handleBulkDelete}
        isConfirming={bulkDeleteGroups.isPending}
        confirmLabel="Delete groups"
        variant="destructive"
      >
        <div className="border-border/60 bg-muted/20 space-y-3 rounded-lg border p-3 text-sm">
          <p className="font-medium">Plugin access that will be removed</p>
          {selectedPluginAccess.length > 0 ? (
            <ul className="text-muted-foreground space-y-1">
              {selectedPluginAccess.map(({ plugin_name, actions }) => (
                <li key={plugin_name}>
                  <span className="text-foreground font-medium">{plugin_name}</span>:{" "}
                  {Array.from(actions).sort().join(", ")}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              None of the selected groups currently grants plugin access.
            </p>
          )}
        </div>
      </ConfirmDialog>
    </PageShell>
  );
}
