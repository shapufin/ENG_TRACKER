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
        total={data.count}
        members={data.results.reduce((sum, t) => sum + (t.members_count ?? 0), 0)}
        noLeader={leaderCounts.incomplete}
        groups={groupsData?.length ?? 0}
      />

      <TeamDataTable
        header={
          <TeamsPageFilters
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

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Delete Team"
        description={`Are you sure you want to delete team "${confirmDelete?.name}"?`}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
      />
    </PageShell>
  );
};
