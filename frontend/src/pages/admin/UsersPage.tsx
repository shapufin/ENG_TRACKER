import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { mfaErrorMessage, mfaService } from "@/services/mfaService";
import type { Team, UserProfile } from "@/types";

export const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const state = useUsersPage();
  const [viewingId, setViewingId] = useState<number | null>(null);
  // Resolve the open panel from the live list so an inline save refreshes the
  // panel through the normal ["admin"] invalidation — never a stale snapshot.
  const viewing =
    viewingId != null ? (state.profiles?.find((p) => p.id === viewingId) ?? null) : null;
  const [grantCRProfile, setGrantCRProfile] = useState<UserProfile | null>(null);
  const [resetMfaProfile, setResetMfaProfile] = useState<UserProfile | null>(null);
  const resetMfa = useMutation({
    mutationFn: (userId: number) => mfaService.adminReset(userId),
    onSuccess: () => {
      toast.success("Two-factor authentication reset");
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      setResetMfaProfile(null);
    },
    onError: (err: unknown) => {
      toast.error(mfaErrorMessage(err, "Could not reset two-factor authentication."));
      setResetMfaProfile(null);
    },
  });
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
        onResetMfa={setResetMfaProfile}
        onDelete={(profile) => state.setConfirmDelete(profile)}
        onSaveField={(userId, payload) => state.updateMutation.mutate({ id: userId, payload })}
        isSaving={state.updateMutation.isPending}
        teamsData={(state.teamsData || []) as unknown as Team[]}
        techsData={state.techs || []}
        italianTLs={state.italianTLs || []}
        albanianTLs={state.albanianTLs || []}
        currentUser={currentUser}
        onNavigateToSettings={() => navigate("/settings")}
      />
      <ConfirmDialog
        open={resetMfaProfile !== null}
        onOpenChange={(open) => {
          if (!open) setResetMfaProfile(null);
        }}
        title="Reset two-factor authentication?"
        description={`${resetMfaProfile?.user.username ?? "This user"} will be signed out everywhere and loses their authenticator and backup codes. If it is required for them, they set it up again at the next sign-in.`}
        confirmLabel="Reset"
        variant="destructive"
        isConfirming={resetMfa.isPending}
        onConfirm={() => resetMfaProfile && resetMfa.mutate(resetMfaProfile.user.id)}
      />
    </PageShell>
  );
};
