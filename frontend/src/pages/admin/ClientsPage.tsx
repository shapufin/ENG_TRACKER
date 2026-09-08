import React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Plus } from "lucide-react";
import { ClientDataTable } from "@/components/admin/ClientDataTable";
import { ClientFormDialog } from "@/components/admin/ClientFormDialog";
import { useClientManagement } from "./hooks/useClientManagement";

export const ClientsPage: React.FC = () => {
  const {
    clients,
    isLoading,
    formOpen,
    setFormOpen,
    editing,
    form,
    formErrors,
    confirmDelete,
    setConfirmDelete,
    createMutation,
    updateMutation,
    deleteMutation,
    handleSubmit,
    openEdit,
    openCreate,
    updateField,
    refetch,
  } = useClientManagement();

  if (isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (!clients) return <ErrorCard title="Failed to load clients" onRetry={refetch} />;

  return (
    <PageShell
      title="Clients"
      actions={
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Client
        </Button>
      }
    >
      <ClientDataTable clients={clients} onEdit={openEdit} onDelete={setConfirmDelete} />

      <ClientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        form={form}
        formErrors={formErrors}
        onFieldChange={updateField}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Delete Client"
        description={`Are you sure you want to delete ${confirmDelete?.name}?`}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
      />
    </PageShell>
  );
};
