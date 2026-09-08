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
import { Input } from "@/components/ui/input";
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
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Superuser controls
        </Badge>
      }
    >
      {/* Summary metrics */}
      <GlassCard className="overflow-visible p-0" isHoverLift={false} glow="primary">
        <div className="grid gap-0 md:grid-cols-[1.4fr_1fr]">
          <div className="border-b border-border/60 p-6 md:border-b-0 md:border-r md:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <KeyRound className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Least-privilege access</p>
                <h2 className="text-xl font-semibold tracking-tight">
                  Keep access easy to understand
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Groups add plugin capabilities to specific people. They never change a user&apos;s
                  role, shell, or Control Room scope.
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border/60">
            <div className="flex flex-col justify-center p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Groups
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{totalCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Reusable access sets</p>
            </div>
            <div className="flex flex-col justify-center p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Memberships
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">
                {groupList.reduce((sum, g) => sum + (g.member_count ?? 0), 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">On this page</p>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Toolbar */}
      <GlassCard className="p-4" isHoverLift={false}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search groups"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={clearSearch}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {selectedCount > 0 && (
              <Button
                variant="destructive"
                onClick={() => setBulkDeleteOpen(true)}
                aria-label={`Delete ${selectedCount} selected group${selectedCount === 1 ? "" : "s"}`}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete selected ({selectedCount})
              </Button>
            )}
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create group
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Directory table / states */}
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
        <GlassCard className="p-0" isHoverLift={false}>
          {/* Desktop table */}
          <div className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="w-12 px-4 py-3 font-medium">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                      aria-label="Select all visible groups"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Members</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {groupList.map((group) => (
                  <tr
                    key={group.id}
                    className={`border-b border-border/40 transition-colors last:border-0 hover:bg-muted/30 ${
                      selectedGroupIds.has(group.id) ? "ring-1 ring-primary/20" : ""
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
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <UsersRound className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground" title={group.name}>
                            {group.name}
                          </p>
                          {group.description && (
                            <p
                              className="truncate text-xs text-muted-foreground"
                              title={group.description}
                            >
                              {group.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[11px]">
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
          <div className="divide-y divide-border/40 md:hidden">
            {groupList.map((group) => (
              <div
                key={group.id}
                className={`p-4 ${selectedGroupIds.has(group.id) ? "ring-1 ring-primary/20" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedGroupIds.has(group.id)}
                      onCheckedChange={(checked) => toggleGroup(group.id, checked === true)}
                      aria-label={`Select ${group.name}`}
                      className="mt-2"
                    />
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <UsersRound className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground" title={group.name}>
                        {group.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={group.code}>
                        {group.code}
                      </p>
                      {group.description && (
                        <p
                          className="mt-1 truncate text-xs text-muted-foreground"
                          title={group.description}
                        >
                          {group.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[11px]">
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
            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
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
        </GlassCard>
      )}

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
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
          <p className="font-medium">Plugin access that will be removed</p>
          {selectedPluginAccess.length > 0 ? (
            <ul className="space-y-1 text-muted-foreground">
              {selectedPluginAccess.map(({ plugin_name, actions }) => (
                <li key={plugin_name}>
                  <span className="font-medium text-foreground">{plugin_name}</span>:{" "}
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
