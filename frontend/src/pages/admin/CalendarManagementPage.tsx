import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { PageShell } from "@/components/layout/PageShell";
import { PluginImportButton } from "@/components/admin/PluginImportButton";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, RefreshCcw, Share2, Layers, CalendarRange, CalendarDays } from "lucide-react";
import { CalendarGroupStatsCard } from "@/components/admin/CalendarGroupStatsCard";
import { CalendarGroupInfoCard } from "@/components/admin/CalendarGroupInfoCard";
import { CalendarGroupWorkflowCard } from "@/components/admin/CalendarGroupWorkflowCard";
import { CalendarGroupCard } from "@/components/admin/CalendarGroupCard";
import { TeamsTable } from "@/components/admin/TeamsTable";
import { HolidayTable } from "./components/HolidayTable";
import { ManageTeamsDialog } from "./components/ManageTeamsDialog";
import { HolidayFormDialog } from "./components/HolidayFormDialog";
import { TeamEditDialog } from "./components/TeamEditDialog";
import { GroupRenameDialog } from "./components/GroupRenameDialog";
import { useCalendarManagementPage } from "./hooks/useCalendarManagementPage";

// fallow-ignore-next-line complexity
export const CalendarManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    activeTab,
    setActiveTab,
    selectedTeams,
    setSelectedTeams,
    bulkGroup,
    setBulkGroup,
    bulkConfirmOpen,
    setBulkConfirmOpen,
    pendingBulkGroup,
    setPendingBulkGroup,
    formOpen,
    setFormOpen,
    editingTeam,
    form,
    setForm,
    holidayFormOpen,
    setHolidayFormOpen,
    editingHoliday,
    setEditingHoliday,
    holidayForm,
    setHolidayForm,
    deleteTarget,
    setDeleteTarget,
    deleteGroupTarget,
    setDeleteGroupTarget,
    editGroupOpen,
    setEditGroupOpen,
    editingGroup,
    setEditingGroup,
    newGroupName,
    setNewGroupName,
    searchQuery,
    setSearchQuery,
    manageTeamsOpen,
    setManageTeamsOpen,
    managingGroup,
    setManagingGroup,
    teams,
    calendarGroups,
    groupStats,
    holidaysLoading,
    isLoading,
    workspaceOptions,
    updateTeamMutation,
    renameGroupMutation,
    clearGroupMutation,
    holidayMutation,
    deleteHolidayMutation,
    openHolidayForm,
    openEdit,
    handleBulkApplyIntent,
    confirmBulkUpdate,
    handleHolidaySubmit,
    holidayRows,
  } = useCalendarManagementPage();

  if (isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (!teams)
    return (
      <ErrorCard
        title="Failed to load calendar management"
        onRetry={() => queryClient.invalidateQueries({ queryKey: ["admin"] })}
      />
    );

  return (
    <PageShell
      category="Calendar Administration"
      title="Team Calendar Groups"
      subtitle="Assign calendar groups to teams so they can view each other's leave, overtime, and standby entries"
      actions={
        <Button
          variant="outline"
          className="h-9 rounded-xl border-border bg-muted/50"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["admin"] })}
        >
          <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      }
    >
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
          <TabsList className="bg-card">
            <TabsTrigger value="team-groups">Team Calendar Groups</TabsTrigger>
            <TabsTrigger value="workspaces">Calendar Workspaces</TabsTrigger>
            <TabsTrigger value="holidays">Holidays</TabsTrigger>
          </TabsList>

          <TabsContent value="team-groups" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_0.8fr]">
              <CalendarGroupInfoCard
                icon={Share2}
                trackingLabel="How calendar sharing works"
                title="Share calendar visibility across teams"
                description="When you assign the same calendar group to multiple teams, they can see each other's leave, overtime, and standby entries in the Calendar page."
                exampleTitle="Example"
                exampleText="Assign group 'Regional-Pod-A' to MSC_TEAM and SIAE_TEAM => Both teams see each other's calendar entries in the workspace selector."
                gradient
              />
              <CalendarGroupWorkflowCard
                icon={Layers}
                title="Sharing workflow"
                subtitle="Quick setup guide"
                steps={[
                  "Select teams from the table below",
                  "Type a group name (e.g., msc-siae-shared)",
                  "Click 'Apply to selected'",
                  "Teams refresh their Calendar page to see shared entries",
                ]}
              />
            </div>

            {groupStats && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <CalendarGroupStatsCard
                  title="Active Calendar Groups"
                  value={groupStats.active_groups}
                  icon={Share2}
                />
                <CalendarGroupStatsCard
                  title="Teams Grouped"
                  value={groupStats.teams_grouped}
                  subtitle={`${groupStats.total_teams > 0 ? Math.round((groupStats.teams_grouped / groupStats.total_teams) * 100) : 0}% of ${groupStats.total_teams} teams`}
                  icon={Layers}
                />
                <CalendarGroupStatsCard
                  title="Ungrouped Teams"
                  value={groupStats.teams_ungrouped}
                  subtitle="Assign them to activate sharing"
                  icon={CalendarRange}
                />
              </div>
            )}

            {(calendarGroups?.length ?? 0) > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Shared Calendar Groups
                </h2>
                <div className="grid gap-3">
                  {calendarGroups?.map((group) => (
                    <CalendarGroupCard
                      key={group.calendar_group}
                      groupName={group.calendar_group}
                      teamCount={group.team_count}
                      onEdit={() => {
                        setEditingGroup(group.calendar_group);
                        setNewGroupName(group.calendar_group);
                        setEditGroupOpen(true);
                      }}
                      onDelete={() => setDeleteGroupTarget(group.calendar_group)}
                      onManageTeams={() => {
                        setManagingGroup(group.calendar_group);
                        setManageTeamsOpen(true);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <GlassCard isHoverLift={false} className="p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm font-medium">
                  {selectedTeams.size} team{selectedTeams.size === 1 ? "" : "s"} selected
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <Input
                    value={bulkGroup}
                    onChange={(e) => setBulkGroup(e.target.value)}
                    placeholder="Enter group name (e.g., msc-siae-shared)"
                    className="h-9 w-full max-w-[280px] rounded-xl border-border bg-muted/50"
                  />
                  <Button
                    onClick={handleBulkApplyIntent}
                    disabled={!bulkGroup.trim() || selectedTeams.size === 0}
                    className="h-9 rounded-xl bg-primary hover:bg-primary/80"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Apply to selected
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    Teams in the same group can view each other's entries.
                  </div>
                </div>
              </div>
            </GlassCard>

            <TeamsTable
              teams={teams}
              selectedTeams={selectedTeams}
              onSelectionChange={setSelectedTeams}
              onEditTeam={openEdit}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </TabsContent>

          <TabsContent value="workspaces" className="space-y-4">
            <GlassCard isHoverLift={false} className="p-5">
              <h2 className="text-lg font-semibold">Calendar Workspaces</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Advanced calendar workspaces with fine-grained permissions. For simple team sharing,
                use the Team Calendar Groups tab.
              </p>
              <div className="mt-3">
                <Badge variant="outline" className="border-primary/30 text-primary">
                  Coming Soon
                </Badge>
              </div>
            </GlassCard>
          </TabsContent>

          <TabsContent value="holidays" className="space-y-4">
            <GlassCard isHoverLift={false} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Holiday Catalog
                  </p>
                  <h3 className="text-lg font-semibold">Global & Workspace Holidays</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <PluginImportButton
                    targetKey="public_holidays"
                    label="Import holidays"
                    invalidateKeys={[["admin"]]}
                  />
                  <Button onClick={() => openHolidayForm()}>
                    <CalendarDays className="mr-2 h-4 w-4" /> Add Holiday
                  </Button>
                </div>
              </div>
            </GlassCard>
            <HolidayTable
              holidays={holidayRows}
              isLoading={holidaysLoading}
              onEdit={openHolidayForm}
              onDelete={setDeleteTarget}
            />
          </TabsContent>
        </Tabs>

        <ConfirmDialog
          open={bulkConfirmOpen}
          onOpenChange={(open) => {
            setBulkConfirmOpen(open);
            if (!open) setPendingBulkGroup(null);
          }}
          title="Apply shared calendar group"
          description={`Apply "${pendingBulkGroup ?? ""}" to ${selectedTeams.size} selected team${selectedTeams.size === 1 ? "" : "s"}?`}
          onConfirm={confirmBulkUpdate}
          variant="default"
        >
          <p className="text-sm text-muted-foreground">
            This updates the calendar_group on every selected team so they can view each other's
            leave, overtime, and standby entries.
          </p>
        </ConfirmDialog>

        <TeamEditDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          editingTeam={editingTeam}
          formValue={form.calendar_group}
          onFormChange={(v) => setForm({ calendar_group: v === "none" ? "" : v })}
          calendarGroups={calendarGroups}
          isSubmitting={updateTeamMutation.isPending}
          onSubmit={(e) => {
            e.preventDefault();
            if (!editingTeam) return;
            updateTeamMutation.mutate({
              id: editingTeam.id,
              payload: { calendar_group: form.calendar_group.trim() },
            });
          }}
        />

        <GroupRenameDialog
          open={editGroupOpen}
          onOpenChange={setEditGroupOpen}
          editingGroup={editingGroup}
          newGroupName={newGroupName}
          onNewGroupNameChange={setNewGroupName}
          isSubmitting={renameGroupMutation.isPending}
          onSubmit={(e) => {
            e.preventDefault();
            if (!editingGroup || !newGroupName.trim()) return;
            renameGroupMutation.mutate({ oldName: editingGroup, newName: newGroupName.trim() });
          }}
        />

        <HolidayFormDialog
          open={holidayFormOpen}
          onOpenChange={(open) => {
            setHolidayFormOpen(open);
            if (!open) {
              setEditingHoliday(null);
              setHolidayForm({
                name: "",
                date: "",
                country_code: "",
                is_global: true,
                description: "",
                calendar: "global",
              });
            }
          }}
          editingName={editingHoliday?.name}
          form={holidayForm}
          onFormChange={setHolidayForm}
          workspaceOptions={workspaceOptions}
          isSubmitting={holidayMutation.isPending}
          onSubmit={handleHolidaySubmit}
        />

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title="Delete Holiday"
          description={`Are you sure you want to delete "${deleteTarget?.name ?? ""}"?`}
          onConfirm={() => deleteTarget && deleteHolidayMutation.mutate(deleteTarget.id)}
          isConfirming={deleteHolidayMutation.isPending}
          variant="destructive"
        />
        <ConfirmDialog
          open={Boolean(deleteGroupTarget)}
          onOpenChange={(open) => {
            if (!open) setDeleteGroupTarget(null);
          }}
          title="Remove Calendar Group"
          description={`Are you sure you want to remove "${deleteGroupTarget}" from all teams? Teams will no longer see each other's calendars.`}
          onConfirm={() => deleteGroupTarget && clearGroupMutation.mutate(deleteGroupTarget)}
          isConfirming={clearGroupMutation.isPending}
          variant="destructive"
        />

        <ManageTeamsDialog
          open={manageTeamsOpen}
          onOpenChange={setManageTeamsOpen}
          groupName={managingGroup}
          teams={teams}
          onUpdateTeam={(id, payload) => updateTeamMutation.mutate({ id, payload })}
          isPending={updateTeamMutation.isPending}
        />
    </PageShell>
  );
};
