import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { useUsersPage } from "./hooks/useUsersPage";
import { useUserColumns } from "./hooks/useUserColumns";
import { UsersPageHeader } from "./components/UsersPageHeader";
import { UsersPageContent } from "./components/UsersPageContent";
import { UsersPageDialogs } from "./components/UsersPageDialogs";
import { UserDetailPanel } from "@/components/admin/UserDetailPanel";
import { PluginGrantCRAccessDialog } from "@/components/admin/PluginCRUserDialogs";
import type { Team, UserProfile } from "@/types";

export const UsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const state = useUsersPage();
  const [viewingId, setViewingId] = useState<number | null>(null);
  // Resolve the open panel from the live list so an inline save refreshes the
  // panel through the normal ["admin"] invalidation — never a stale snapshot.
  const viewing =
    viewingId != null ? (state.profiles?.find((p) => p.id === viewingId) ?? null) : null;
  const [grantCRProfile, setGrantCRProfile] = useState<UserProfile | null>(null);
  const columns = useUserColumns(
    state.openEdit,
    state.openReset,
    (profile) => state.setConfirmDelete(profile),
    {
      crActive: state.crActive,
      crAccessUserIds: state.crAccessUserIds,
      crAccessByUserId: state.crAccessByUserId,
      showCRScopeTeams: state.isCROnlyAdmin,
      onView: (profile) => setViewingId(profile.id),
      onGrantCR: setGrantCRProfile,
    }
  );

  if (state.isLoading) {
    return <LoadingCard rows={6} className="min-h-[400px]" />;
  }

  if (!state.profiles) {
    return (
      <ErrorCard
        title="Failed to load users"
        onRetry={() => queryClient.invalidateQueries({ queryKey: ["admin"] })}
      />
    );
  }

  return (
    <PageShell
      title="Users"
      subtitle="Manage users, teams, and permissions"
      actions={<UsersPageHeader onCreate={state.openCreate} />}
    >
      <UsersPageContent state={state} columns={columns} />
      <UsersPageDialogs state={state} />
      {grantCRProfile && (
        <PluginGrantCRAccessDialog
          key={grantCRProfile.user.id}
          open
          onOpenChange={(open) => {
            if (!open) setGrantCRProfile(null);
          }}
          teams={(state.teamsData || []) as unknown as Team[]}
          existingUserIds={Array.from(state.crAccessByUserId.keys())}
          initialUserId={grantCRProfile.user.id}
          initialUser={{
            id: grantCRProfile.user.id,
            username: grantCRProfile.user.username,
            email: grantCRProfile.user.email ?? "",
            full_name: grantCRProfile.user.full_name,
          }}
        />
      )}
      <UserDetailPanel
        profile={viewing}
        onOpenChange={(open) => {
          if (!open) setViewingId(null);
        }}
        onEdit={state.openEdit}
        onReset={state.openReset}
        onDelete={(profile) => state.setConfirmDelete(profile)}
        onSaveField={(userId, payload) => state.updateMutation.mutate({ id: userId, payload })}
        isSaving={state.updateMutation.isPending}
      />
    </PageShell>
  );
};
