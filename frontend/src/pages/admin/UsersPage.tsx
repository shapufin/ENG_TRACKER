import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { useUsersPage } from "./hooks/useUsersPage";
import { useUserColumns } from "./hooks/useUserColumns";
import { UsersPageHeader } from "./components/UsersPageHeader";
import { UsersPageContent } from "./components/UsersPageContent";
import { UsersPageDialogs } from "./components/UsersPageDialogs";

export const UsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const state = useUsersPage();
  const columns = useUserColumns(
    state.openEdit,
    state.openReset,
    (profile) => state.setConfirmDelete(profile),
    {
      crActive: state.crActive,
      crAccessUserIds: state.crAccessUserIds,
      crAccessByUserId: state.crAccessByUserId,
      showCRScopeTeams: state.isCROnlyAdmin,
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
    </PageShell>
  );
};
