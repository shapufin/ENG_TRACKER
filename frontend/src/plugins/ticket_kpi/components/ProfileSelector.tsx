import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import type { ExportProfile } from "../types/ticketKPI";
import type { Client } from "@/types";

interface ProfileSelectorProps {
  selectedProfileId: number | null;
  onProfileChange: (profileId: number | null) => void;
  profiles: ExportProfile[] | undefined;
  clients: Client[] | undefined;
}

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  selectedProfileId,
  onProfileChange,
  profiles,
  clients,
}) => {
  const activeProfiles = React.useMemo(
    () => profiles?.filter((p) => p.is_active) ?? [],
    [profiles]
  );
  const selectedProfile = activeProfiles.find((p) => p.id === selectedProfileId);

  if (activeProfiles.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label>Export Profile (optional)</Label>
      <Select
        value={selectedProfileId?.toString() || ""}
        onValueChange={(v) => onProfileChange(v ? Number(v) : null)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Auto-detect from file" />
        </SelectTrigger>
        <SelectContent>
          {activeProfiles.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Select a profile, or leave empty to auto-detect from your file columns.
      </p>
      {selectedProfile?.assigned_client_ids && selectedProfile.assigned_client_ids.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Scoped to clients:</span>
          {selectedProfile.assigned_client_ids.map((id) => {
            const client = clients?.find((c) => c.id === id);
            return (
              <Badge key={id} variant="outline" className="text-[10px]">
                {client ? client.name : `Client ${id}`}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
};
