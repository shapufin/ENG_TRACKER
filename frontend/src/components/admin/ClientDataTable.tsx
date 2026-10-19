import React, { useMemo } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { GlassCard } from "@/components/ui/GlassCard";
import { UserCell } from "./UserCell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createEditDeleteActionsColumn } from "@/components/ui/tableColumnHelpers";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import type { Client } from "@/types";

interface ClientDataTableProps {
  clients: Client[];
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
}

export const ClientDataTable: React.FC<ClientDataTableProps> = ({ clients, onEdit, onDelete }) => {
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
          row.original.description || <span className="text-muted-foreground">—</span>,
      },
      {
        id: "is_active",
        accessorKey: "is_active",
        header: "Active",
        cell: ({ row }) => (
          <StatusBadge
            variant={row.original.is_active ? "approved" : "cancelled"}
            label={row.original.is_active ? "Yes" : "No"}
            isCompact
            isShowIcon={false}
          />
        ),
      },
      createEditDeleteActionsColumn<Client>(onEdit, onDelete),
    ],
    [onEdit, onDelete]
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
