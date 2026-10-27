import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageShell } from "@/components/layout/PageShell";
import { PluginImportButton } from "@/components/admin/PluginImportButton";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Plus } from "lucide-react";
import { TeamFormDialog } from "@/components/admin/TeamFormDialog";
import { TeamDataTable } from "@/components/admin/TeamDataTable";
import { ArchiveTeamDialog } from "@/components/admin/ArchiveTeamDialog";
import { TeamLifecycleDialog } from "@/components/admin/TeamLifecycleDialog";
import { TeamStatsCards } from "./components/TeamStatsCards";
import { TeamsPageFilters } from "./components/TeamsPageFilters";
import { useTeamsPage } from "./hooks/useTeamsPage";

// fallow-ignore-next-line complexity
export const TeamsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    groupsData,
    formOpen,
    setFormOpen,
    editing,
    confirmDelete,
    setConfirmDelete,
    archiveTarget,
    setArchiveTarget,
    lifecycleTarget,
    setLifecycleTarget,
    archiveMutation,
    unarchiveMutation,
    status,
    setStatus,
    statusCounts,
    activeTeams,
    form,
    setForm,
    formErrors,
    setFormErrors,
    expanded,
    hoveredPath,
    visibleData,
    create,
    update,
    deleteMutation,
    openCreate,
    openEdit,
    handleSubmit,
    setHoveredTeam,
    toggleExpand,
    leaderFilter,
    setLeaderFilter,
    groupFilter,
    setGroupFilter,
    leaderCounts,
    hasActiveFilters,
    resetFilters,
  } = useTeamsPage();

  if (isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (!data)
    return (
      <ErrorCard
        title="Failed to load teams"
        onRetry={() => queryClient.invalidateQueries({ queryKey: ["admin"] })}
      />
    );

  return (
    <PageShell
      title="Teams"
      actions={
        <div className="flex flex-wrap gap-2">
          <PluginImportButton targetKey="teams" invalidateKeys={[["admin"]]} />
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Team
          </Button>
        </div>
      }
    >
      <TeamStatsCards
        total={activeTeams.length}
        members={activeTeams.reduce((sum, t) => sum + (t.members_count ?? 0), 0)}
        noLeader={leaderCounts.incomplete}
        groups={groupsData?.length ?? 0}
      />

      <TeamDataTable
        header={
          <TeamsPageFilters
            status={status}
            onStatusChange={setStatus}
            statusCounts={statusCounts}
            leaderFilter={leaderFilter}
            onLeaderFilterChange={setLeaderFilter}
            groups={(groupsData ?? []).map((g) => g.calendar_group)}
            groupFilter={groupFilter}
            onGroupFilterChange={setGroupFilter}
            counts={leaderCounts}
            hasActiveFilters={hasActiveFilters}
            onReset={resetFilters}
          />
        }
        data={visibleData}
        emptyMessage={hasActiveFilters ? "No teams match the current filters." : "No teams yet."}
        expanded={expanded}
        onToggleExpand={toggleExpand}
        onEdit={openEdit}
        onDelete={setConfirmDelete}
        onArchive={setArchiveTarget}
        // Restoring moves the row out of the Archived view; follow it back to Active.
        onUnarchive={(team) =>
          unarchiveMutation.mutate(team.id, { onSuccess: () => setStatus("active") })
        }
        onManageArchived={setLifecycleTarget}
        hoveredPath={hoveredPath}
        onRowMouseEnter={(team) => setHoveredTeam(team.id)}
        onRowMouseLeave={() => setHoveredTeam(null)}
      />

      <TeamFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        form={form}
        onFormChange={setForm}
        formErrors={formErrors}
        onFormErrorsChange={setFormErrors}
        groups={groupsData}
        onSubmit={handleSubmit}
        isSubmitting={create.isPending || update.isPending}
      />

      <ArchiveTeamDialog
        team={archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        onConfirm={(id) => archiveMutation.mutate(id, { onSuccess: () => setStatus("archived") })}
        isArchiving={archiveMutation.isPending}
      />

      {lifecycleTarget && (
        <TeamLifecycleDialog
          team={lifecycleTarget}
          open
          onOpenChange={(open) => !open && setLifecycleTarget(null)}
          onDelete={(id) => deleteMutation.mutate(id)}
          isDeleting={deleteMutation.isPending}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Delete Team"
        description={`Delete team "${confirmDelete?.name}"? A team that was ever used cannot be deleted: archive it instead.`}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
      />
    </PageShell>
  );
};
