import React, { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { GlassCard } from "@/components/ui/GlassCard";
import { PageShell } from "@/components/layout/PageShell";
import { StatCard } from "@/components/ui/StatCard";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { extractApiErrorMessage } from "@/lib/apiFormError";
import { EditCRUserDialog } from "../components/EditCRUserDialog";
import { CreateCRUserDialog } from "../components/CreateCRUserDialog";
import { GrantControlRoomAccessDialog } from "../components/GrantControlRoomAccessDialog";
import { BulkControlRoomAccessDialog } from "../components/BulkControlRoomAccessDialog";
import { ControlRoomAccessBulkBar } from "../components/ControlRoomAccessBulkBar";
import { useControlRoomAccessPage } from "../hooks/useControlRoomAccessPage";
import type { ControlRoomAccess } from "../types";

type AccessTableRow = ControlRoomAccess & { search_text: string };

const ScopeCell: React.FC<{ access: ControlRoomAccess }> = ({ access }) => {
  if (access.team_scopes.length === 0) {
    return (
      <Badge variant="outline" className="border-warning/50 text-foreground">
        No visibility
      </Badge>
    );
  }

  const visibleScopes = access.team_scopes.slice(0, 3);
  const remainingCount = access.team_scopes.length - visibleScopes.length;

  return (
    <div className="flex max-w-[28rem] flex-wrap gap-1.5">
      {visibleScopes.map((scope) => (
        <Badge key={scope.id} variant="secondary" className="font-normal">
          {scope.team_name}
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge variant="outline" className="font-normal">
          +{remainingCount} more
        </Badge>
      )}
    </div>
  );
};

const AccessTableSkeleton: React.FC = () => (
  <div className="space-y-3" aria-label="Loading access records">
    {Array.from({ length: 5 }, (_, index) => (
      <div key={index} className="flex animate-pulse items-center gap-4 rounded-lg border p-4">
        <div className="h-4 w-4 rounded bg-muted" />
        <div className="h-4 w-1/4 rounded bg-muted" />
        <div className="h-4 w-2/5 rounded bg-muted" />
        <div className="h-4 w-16 rounded bg-muted" />
        <div className="ml-auto h-4 w-20 rounded bg-muted" />
      </div>
    ))}
  </div>
);

const AccessStats: React.FC<{
  accessList: ControlRoomAccess[];
  isLoading: boolean;
  isError: boolean;
}> = ({ accessList, isLoading, isError }) => {
  const activeCount = accessList.filter((access) => access.is_active).length;
  const inactiveCount = accessList.length - activeCount;
  const scopeCount = accessList.reduce((total, access) => total + access.team_scopes.length, 0);
  const value = (number: number) => (isLoading || isError ? "—" : number);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Total access"
        value={value(accessList.length)}
        icon={Users}
        glow="primary"
        iconColorClass="text-primary/70"
      />
      <StatCard
        label="Active"
        value={value(activeCount)}
        icon={ShieldCheck}
        glow="success"
        iconColorClass="text-success"
        valueColorClass="text-foreground"
      />
      <StatCard
        label="Inactive"
        value={value(inactiveCount)}
        icon={UserX}
        glow="warning"
        iconColorClass="text-warning"
        valueColorClass="text-foreground"
      />
      <StatCard
        label="Team assignments"
        value={value(scopeCount)}
        icon={CheckCircle2}
        iconColorClass="text-primary/70"
      />
    </div>
  );
};

export const ControlRoomAccessPage: React.FC = () => {
  const state = useControlRoomAccessPage();
  const tableData = useMemo<AccessTableRow[]>(
    () =>
      state.accessList.map((access) => ({
        ...access,
        search_text: `${access.user_name} ${access.display_name} ${access.username} ${access.email}`,
      })),
    [state.accessList]
  );

  const columns = useMemo<ColumnDef<AccessTableRow>[]>(
    () => [
      {
        id: "user",
        accessorKey: "search_text",
        header: "User",
        cell: ({ row }) => {
          const access = row.original;
          return (
            <div className="min-w-48">
              <div className="flex items-center gap-2 font-medium">
                <span
                  className="truncate"
                  title={access.user_name || access.display_name || access.username}
                >
                  {access.user_name || access.display_name || access.username}
                </span>
                {!access.is_active && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    Inactive
                  </Badge>
                )}
              </div>
              <div
                className="truncate text-xs text-muted-foreground"
                title={access.email || `@${access.username}`}
              >
                {access.email || `@${access.username}`}
              </div>
            </div>
          );
        },
      },
      {
        id: "scope",
        accessorFn: (access) => access.team_scopes.map((scope) => scope.team_name).join(", "),
        header: "Team visibility",
        cell: ({ row }) => <ScopeCell access={row.original} />,
      },
      {
        id: "status",
        accessorFn: (access) => (access.is_active ? "Active" : "Inactive"),
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? "default" : "outline"}>
            {row.original.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "created",
        accessorKey: "created_at",
        header: "Added",
        cell: ({ row }) => (
          <div className="whitespace-nowrap text-xs text-muted-foreground">
            {formatDateDDMMYYYY(row.original.created_at)}
            {row.original.created_by_name && <div>by {row.original.created_by_name}</div>}
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        enableHiding: false,
        cell: ({ row }) => {
          const access = row.original;
          return (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => state.setEditingAccess(access)}
                aria-label={`Edit ${access.username}`}
                title="Edit access"
              >
                <Edit3 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => state.handleToggleActive(access)}
                disabled={state.updateMutation.isPending}
                aria-label={`${access.is_active ? "Deactivate" : "Activate"} ${access.username}`}
                title={access.is_active ? "Deactivate access" : "Activate access"}
              >
                {access.is_active ? (
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Shield className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => state.setRevokeAccess(access)}
                disabled={state.deleteMutation.isPending}
                aria-label={`Revoke ${access.username}`}
                title="Revoke access"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    [state]
  );

  return (
    <PageShell
      category="Control Room administration"
      title="Access management"
      subtitle="Control who can view standby data and keep team visibility scoped by design."
      actions={
        <>
          <Button variant="outline" onClick={() => state.setGrantOpen(true)}>
            <ShieldCheck className="mr-2 h-4 w-4" /> Grant access
          </Button>
          <Button onClick={() => state.setCreateOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" /> Create CR user
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <GlassCard
          isHoverLift={false}
          role="status"
          aria-label="Control Room visibility warning"
          className="border-warning/40 bg-warning/10 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="text-sm text-foreground">
              <strong className="font-semibold">Visibility is always explicit.</strong> A non-admin
              with no assigned teams sees no standby data. Staff and admins retain global access.
            </div>
          </div>
        </GlassCard>

        {state.teamsError && (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm text-destructive">
              Teams could not be loaded. Team visibility selectors may be incomplete.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => state.retryTeams()}>
              Retry teams
            </Button>
          </div>
        )}

        <AccessStats
          accessList={state.accessList}
          isLoading={state.isLoading}
          isError={state.isError}
        />

        <ControlRoomAccessBulkBar
          selectedCount={state.selectedAccesses.length}
          onClear={() => state.setRowSelection({})}
          onOpen={() => {
            state.setBulkError(undefined);
            state.setBulkOpen(true);
          }}
        />

        <GlassCard delay={0} className="p-4">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Access records</h2>
              <p className="text-sm text-muted-foreground">
                Select records to update together. Edit a user to manage profile details and scope.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {state.isLoading
                ? "Loading records…"
                : `${state.accessList.length} record${state.accessList.length === 1 ? "" : "s"}`}
            </span>
          </div>
          {state.isLoading ? (
            <AccessTableSkeleton />
          ) : state.isError ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-sm text-destructive">
                {extractApiErrorMessage(state.accessError, "Unable to load access records.")}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => state.retryAccess()}>
                Retry
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={tableData}
              searchColumn="search_text"
              searchPlaceholder="Search name, username, or email..."
              enableColumnVisibility
              storageKey="table-visibility-control-room-access"
              enableRowSelection
              rowSelection={state.rowSelection}
              onRowSelectionChange={state.setRowSelection}
              getRowId={(access) => String(access.id)}
              getRowClassName={(access) => (!access.is_active ? "opacity-70" : "")}
              pageSize={25}
              emptyMessage="No access records found."
            />
          )}
        </GlassCard>
      </div>

      <GrantControlRoomAccessDialog
        key={`grant-${state.grantOpen ? (state.deepLinkUserId ?? "new") : "closed"}`}
        open={state.grantOpen}
        onOpenChange={state.setGrantOpen}
        teams={state.teams}
        existingUserIds={state.existingUserIds}
        initialUserId={state.deepLinkUserId}
      />
      <CreateCRUserDialog
        open={state.createOpen}
        onOpenChange={state.setCreateOpen}
        teams={state.teams}
      />
      <EditCRUserDialog
        key={state.editingAccess?.id ?? "none"}
        open={Boolean(state.editingAccess)}
        onOpenChange={(open) => {
          if (!open) state.setEditingAccess(null);
        }}
        access={state.editingAccess}
        username={state.editingAccess?.user_name || state.editingAccess?.username || ""}
        teams={state.teams}
      />
      <BulkControlRoomAccessDialog
        open={state.bulkOpen}
        onOpenChange={(open) => {
          state.setBulkOpen(open);
          if (!open) state.setBulkError(undefined);
        }}
        selectedCount={state.selectedAccesses.length}
        teams={state.teams}
        onSubmit={state.handleBulkUpdate}
        isSubmitting={state.bulkMutation.isPending}
        error={state.bulkError}
      />
      <ConfirmDialog
        open={Boolean(state.revokeAccess)}
        onOpenChange={(open) => {
          if (!open) state.setRevokeAccess(null);
        }}
        title="Revoke Control Room access"
        description={`Revoke access for ${state.revokeAccess?.user_name || state.revokeAccess?.username || "this user"}? Their Control Room access and team scopes will be removed.`}
        onConfirm={state.handleRevoke}
        isConfirming={state.deleteMutation.isPending}
        confirmLabel="Revoke access"
        variant="destructive"
      />
    </PageShell>
  );
};

export default ControlRoomAccessPage;
