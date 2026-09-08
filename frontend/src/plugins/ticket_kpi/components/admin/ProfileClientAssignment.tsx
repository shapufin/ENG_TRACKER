import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Client } from "@/types";

interface ProfileClientAssignmentProps {
  clients: Client[] | undefined;
  assignedClientIds: number[];
  onAssignedClientIdsChange: (ids: number[]) => void;
}

export const ProfileClientAssignment: React.FC<ProfileClientAssignmentProps> = ({
  clients,
  assignedClientIds,
  onAssignedClientIdsChange,
}) => {
  const toggle = (id: number, checked: boolean | string) => {
    onAssignedClientIdsChange(
      checked ? [...assignedClientIds, id] : assignedClientIds.filter((cid) => cid !== id)
    );
  };

  return (
    <div className="space-y-2">
      <Label>Assigned Clients</Label>
      <p className="text-xs text-muted-foreground">
        If empty, this profile is available to all users. Select clients to restrict access.
      </p>
      <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
        {!clients || clients.length === 0 ? (
          <p className="text-xs text-muted-foreground">No clients available.</p>
        ) : (
          clients.map((client) => (
            <div key={client.id} className="flex items-center gap-2">
              <Checkbox
                id={`client-${client.id}`}
                checked={assignedClientIds.includes(client.id)}
                onCheckedChange={(checked) => toggle(client.id, checked)}
              />
              <Label htmlFor={`client-${client.id}`} className="cursor-pointer text-xs">
                {client.name} <span className="text-muted-foreground">({client.code})</span>
              </Label>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
