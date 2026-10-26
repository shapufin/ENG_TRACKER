import React, { useMemo } from "react";
import { Archive, ArchiveRestore, Database, Pencil } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { GlassCard } from "@/components/ui/GlassCard";
import { RowActions, type RowAction } from "@/components/ui/RowActions";
import { UserCell } from "./UserCell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import type { Client } from "@/types";

interface ClientDataTableProps {
  clients: Client[];
  onEdit: (client: Client) => void;
  /** Archive, restore and archived-data actions are superuser-only; staff just edit. */
  canManage: boolean;
  onArchive: (client: Client) => void;
  onUnarchive: (client: Client) => void;
  onManageArchived: (client: Client) => void;
}

export const ClientDataTable: React.FC<ClientDataTableProps> = ({
  clients,
  onEdit,
  canManage,
  onArchive,
  onUnarchive,
  onManageArchived,
}) => {
  const hasDescriptions = clients.some((c) => c.description);

  const columns = useMemo<AppColumnDef<Client>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <UserCell name={row.original.name} />,
      },
      { id: "code", accessorKey: "code", header: "Code" },
      {
        id: "description",
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) =>
          row.original.description || <span className="text-muted-foreground">-</span>,
      },
      {
        id: "is_active",
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge
            variant={row.original.is_active ? "approved" : "cancelled"}
            label={row.original.is_active ? "Active" : "Archived"}
            isCompact
            isShowIcon={false}
          />
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const client = row.original;
          const actions: RowAction[] = [
            { label: `Edit ${client.name}`, icon: Pencil, onClick: () => onEdit(client) },
          ];
          if (canManage && client.is_active) {
            actions.push({
              label: `Archive ${client.name}`,
              icon: Archive,
              tone: "warning",
              onClick: () => onArchive(client),
            });
          }
          if (canManage && !client.is_active) {
            actions.push(
              {
                label: `Unarchive ${client.name}`,
                icon: ArchiveRestore,
                onClick: () => onUnarchive(client),
              },
              {
                label: `Archived data ${client.name}`,
                icon: Database,
                onClick: () => onManageArchived(client),
              }
            );
          }
          return <RowActions actions={actions} />;
        },
      },
    ],
    [onEdit, canManage, onArchive, onUnarchive, onManageArchived]
  );

  return (
    <GlassCard delay={0} className="p-4">
      <DataTable
        columns={columns}
        data={clients || []}
        enableColumnVisibility
        storageKey="table-visibility-clients-page"
        // No description data yet means an all-empty column; it appears as soon as one exists.
        defaultColumnVisibility={{ description: hasDescriptions }}
        searchColumn="name"
        searchPlaceholder="Search clients..."
      />
    </GlassCard>
  );
};
