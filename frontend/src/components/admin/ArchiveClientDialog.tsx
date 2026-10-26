import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { overtimeService } from "@/services/overtimeService";
import type { Client } from "@/types";

interface ArchiveClientDialogProps {
  client: Client | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: number) => void;
  isArchiving?: boolean;
}

/** Says exactly what archiving does, using the live number of assigned users. */
export const ArchiveClientDialog: React.FC<ArchiveClientDialogProps> = ({
  client,
  onOpenChange,
  onConfirm,
  isArchiving = false,
}) => {
  const { data } = useQuery({
    queryKey: ["overtime", "clients", "lifecycle", client?.id],
    queryFn: () => overtimeService.getClientLifecycle(client!.id),
    enabled: !!client,
  });

  const users = data?.assigned_users;
  const unassigned =
    users === undefined
      ? "Every assigned user will be unassigned"
      : `${users} user${users === 1 ? "" : "s"} will be unassigned`;

  return (
    <ConfirmDialog
      open={!!client}
      onOpenChange={onOpenChange}
      title="Archive client"
      description={
        client
          ? `${client.name} is hidden from users, pickers and reports. ${unassigned} ` +
            "(unarchiving does not restore them). Overtime, standby, payroll and onboarding " +
            "records are all kept."
          : undefined
      }
      confirmLabel="Archive client"
      variant="destructive"
      isConfirming={isArchiving}
      onConfirm={() => client && onConfirm(client.id)}
    />
  );
};
