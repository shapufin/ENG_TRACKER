import React from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { Client } from "@/types";

interface ClientSelectorProps {
  selectedClientIds: number[];
  onClientToggle: (clientId: number, checked: boolean) => void;
  clients: Client[] | undefined;
}

export const ClientSelector: React.FC<ClientSelectorProps> = ({
  selectedClientIds,
  onClientToggle,
  clients,
}) => {
  if (!clients || clients.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label>Clients</Label>
      <p className="text-xs text-muted-foreground">Tag this upload with relevant clients.</p>
      <div className="flex flex-wrap gap-3">
        {clients.map((client) => (
          <div key={client.id} className="flex items-center gap-1.5">
            <Checkbox
              id={`upload-client-${client.id}`}
              checked={selectedClientIds.includes(client.id)}
              onCheckedChange={(checked) => onClientToggle(client.id, checked === true)}
            />
            <Label htmlFor={`upload-client-${client.id}`} className="cursor-pointer text-xs">
              {client.name}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
};
