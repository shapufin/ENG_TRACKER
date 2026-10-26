import React, { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { PluginImportButton } from "@/components/admin/PluginImportButton";
import { Button } from "@/components/ui/button";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { Plus } from "lucide-react";
import { ClientDataTable } from "@/components/admin/ClientDataTable";
import { ArchiveClientDialog } from "@/components/admin/ArchiveClientDialog";
import { ClientLifecycleDialog } from "@/components/admin/ClientLifecycleDialog";
import { ClientStatsCards } from "./components/ClientStatsCards";
import { ClientFormDialog } from "@/components/admin/ClientFormDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useClientManagement } from "./hooks/useClientManagement";

type StatusFilter = "active" | "archived" | "all";

export const ClientsPage: React.FC = () => {
  const {
    clients,
    isLoading,
    formOpen,
    setFormOpen,
    editing,
    form,
    formErrors,
    archiveTarget,
    setArchiveTarget,
    lifecycleTarget,
    setLifecycleTarget,
    createMutation,
    updateMutation,
    archiveMutation,
    unarchiveMutation,
    deleteMutation,
    handleSubmit,
    openEdit,
    openCreate,
    updateField,
    refetch,
  } = useClientManagement();
  const { isSuperuser } = usePermissions();
  const [status, setStatus] = useState<StatusFilter>("active");

  const counts = useMemo(() => {
    const all = clients ?? [];
    const activeCount = all.filter((c) => c.is_active).length;
    return { active: activeCount, archived: all.length - activeCount, all: all.length };
  }, [clients]);

  const visible = useMemo(() => {
    if (!clients || status === "all") return clients ?? [];
    return clients.filter((c) => c.is_active === (status === "active"));
  }, [clients, status]);

  if (isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (!clients) return <ErrorCard title="Failed to load clients" onRetry={refetch} />;

  return (
    <PageShell
      title="Clients"
      actions={
        <div className="flex flex-wrap gap-2">
          <PluginImportButton targetKey="clients" invalidateKeys={[["overtime", "clients"]]} />
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        </div>
      }
    >
      <ClientStatsCards clients={clients} />

      <FilterChipRow<StatusFilter>
        label="Status"
        selected={[status]}
        onToggle={setStatus}
        options={[
          { value: "active", label: "Active", count: counts.active },
          { value: "archived", label: "Archived", count: counts.archived },
          { value: "all", label: "All", count: counts.all },
        ]}
      />

      <ClientDataTable
        clients={visible}
        onEdit={openEdit}
        canManage={isSuperuser}
        onArchive={setArchiveTarget}
        // Archiving moves the row out of the default "Active" view; follow it so
        // the client the admin just retired stays on screen instead of vanishing.
        onUnarchive={(client) =>
          unarchiveMutation.mutate(client.id, { onSuccess: () => setStatus("active") })
        }
        onManageArchived={setLifecycleTarget}
      />

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

      <ArchiveClientDialog
        client={archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        onConfirm={(id) => archiveMutation.mutate(id, { onSuccess: () => setStatus("archived") })}
        isArchiving={archiveMutation.isPending}
      />

      {lifecycleTarget && (
        <ClientLifecycleDialog
          client={lifecycleTarget}
          open
          onOpenChange={(open) => !open && setLifecycleTarget(null)}
          onDelete={(id) => deleteMutation.mutate(id)}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </PageShell>
  );
};
