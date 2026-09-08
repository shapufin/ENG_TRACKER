import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2 } from "lucide-react";
import type { Client } from "@/types";
import type { ExportProfile } from "../types/ticketKPI";

interface ProfileCardProps {
  profile: ExportProfile;
  clients?: Client[];
  onEdit: (profile: ExportProfile) => void;
  onDelete: (id: number) => void;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({
  profile,
  clients = [],
  onEdit,
  onDelete,
}) => {
  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{profile.name}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {profile.description || "No description"}
            </p>
          </div>
          <div className="flex gap-1">
            {profile.is_active && (
              <Badge variant="default" className="bg-primary">
                Active
              </Badge>
            )}
            {profile.is_global && <Badge variant="secondary">Global</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Mapped fields: {Object.keys(profile.field_mapping || {}).length}</p>
          <p>Required: {(profile.required_fields || []).length}</p>
          {profile.assigned_client_ids && profile.assigned_client_ids.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {profile.assigned_client_ids.map((id) => (
                <Badge key={id} variant="outline" className="px-1 py-0 text-[10px]">
                  {clientNameById.get(id) ?? `Client ${id}`}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(profile)}>
            <Edit className="mr-1 h-3 w-3" /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(profile.id)}>
            <Trash2 className="mr-1 h-3 w-3 text-destructive" /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
