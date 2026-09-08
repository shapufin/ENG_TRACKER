import React, { useMemo } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { GlassCard } from "@/components/ui/GlassCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createEditDeleteActionsColumn } from "@/components/ui/tableColumnHelpers";
import type { ColumnDef } from "@tanstack/react-table";
import type { Client } from "@/types";

interface ClientDataTableProps {
  clients: Client[];
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
}

export const ClientDataTable: React.FC<ClientDataTableProps> = ({ clients, onEdit, onDelete }) => {
  const columns = useMemo<ColumnDef<Client>[]>(
    () => [
      { id: "name", accessorKey: "name", header: "Name" },
      { id: "code", accessorKey: "code", header: "Code" },
      { id: "description", accessorKey: "description", header: "Description" },
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
        searchColumn="name"
        searchPlaceholder="Search clients..."
      />
    </GlassCard>
  );
};
