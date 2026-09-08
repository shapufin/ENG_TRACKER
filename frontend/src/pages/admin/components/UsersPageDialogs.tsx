import React from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserEditFormDialog } from "./UserEditFormDialog";
import { UserCreateFormDialog } from "./UserCreateFormDialog";
import { CreateCRUserDialog } from "@/plugins/control_room/components/CreateCRUserDialog";
import { EditCRUserDialog } from "@/plugins/control_room/components/EditCRUserDialog";
import type { useUsersPage } from "../hooks/useUsersPage";
import type { Team } from "@/types";

type UsersPageState = ReturnType<typeof useUsersPage>;

interface UsersPageDialogsProps {
  state: UsersPageState;
}

export const UsersPageDialogs: React.FC<UsersPageDialogsProps> = ({ state }) => {
  const teams = (state.teamsData || []) as unknown as Team[];
  const isCROnlyAdmin = state.isCROnlyAdmin;

  // CR admin's edit dialog needs the CR access record for the user being edited.
  const crEditAccess = state.editing
    ? (state.crAccessByUserId.get(state.editing.user.id) ?? null)
    : null;

  return (
    <>
      {/* Edit dialog: CR admin sees simplified form, full admin sees standard form */}
      {isCROnlyAdmin ? (
        <EditCRUserDialog
          key={crEditAccess?.id ?? "none"}
          open={state.formOpen}
          onOpenChange={state.setFormOpen}
          access={crEditAccess}
          username={state.editing?.user?.username ?? ""}
          teams={teams}
        />
      ) : (
        <UserEditFormDialog
          open={state.formOpen}
          onOpenChange={state.setFormOpen}
          editing={state.editing}
          form={state.form}
          formErrors={state.formErrors}
          teamsData={state.teamsData || []}
          techsData={state.techs || []}
          albanianTLs={state.albanianTLs || []}
          italianTLs={state.italianTLs || []}
          isSubmitting={state.updateMutation.isPending}
          onSubmit={state.handleSubmit}
          onFormChange={state.setForm}
          onFormErrorsChange={state.setFormErrors}
        />
      )}

      {/* Create dialog: CR admin sees CR-only form, full admin sees standard form */}
      {isCROnlyAdmin ? (
        <CreateCRUserDialog
          open={state.createOpen}
          onOpenChange={state.setCreateOpen}
          teams={teams}
        />
      ) : (
        <UserCreateFormDialog
          open={state.createOpen}
          onOpenChange={state.setCreateOpen}
          form={state.createForm}
          formErrors={state.createErrors}
          teamsData={state.teamsData || []}
          techsData={state.techs || []}
          albanianTLs={state.albanianTLs || []}
          italianTLs={state.italianTLs || []}
          isSubmitting={state.userCreateMutation.isPending}
          onSubmit={state.handleCreate}
          onFormChange={(form) => state.setCreateForm((current) => ({ ...current, ...form }))}
          onFormErrorsChange={state.setCreateErrors}
        />
      )}

      <FormDialog
        open={state.resetOpen}
        onOpenChange={state.setResetOpen}
        title="Reset Password"
        onSubmit={state.handleReset}
        isSubmitting={state.resetMutation.isPending}
      >
        <div className="space-y-2">
          <Label>New Password</Label>
          <Input
            type="password"
            value={state.resetValue}
            onChange={(e) => state.setResetValue(e.target.value)}
            placeholder="Min 6 characters"
          />
        </div>
      </FormDialog>

      <ConfirmDialog
        open={state.bulkDeleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open) state.setBulkDeleteConfirmOpen(false);
        }}
        title="Delete selected users"
        description={`This will permanently delete ${state.selectedProfiles.length} selected user${state.selectedProfiles.length === 1 ? "" : "s"}. This action cannot be undone.`}
        onConfirm={state.handleBulkDelete}
        isConfirming={state.bulkDeleteMutation.isPending}
        variant="destructive"
      />

      <ConfirmDialog
        open={Boolean(state.confirmDelete)}
        onOpenChange={(open) => {
          if (!open) state.setConfirmDelete(null);
        }}
        title="Delete User"
        description={`Are you sure you want to delete ${state.confirmDelete?.user?.username ?? ""}?`}
        onConfirm={() =>
          state.confirmDelete && state.deleteMutation.mutate(state.confirmDelete.user.id)
        }
        isConfirming={state.deleteMutation.isPending}
        variant="destructive"
      />
    </>
  );
};
