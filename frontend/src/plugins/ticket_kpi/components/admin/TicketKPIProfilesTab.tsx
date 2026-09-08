import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { ProfileCard } from "../../components/ProfileCard";
import type { ExportProfile } from "../../types/ticketKPI";
import type { Client } from "@/types";

interface TicketKPIProfilesTabProps {
  profiles: ExportProfile[] | undefined;
  clients?: Client[];
  onCreate: () => void;
  onEdit: (profile: ExportProfile) => void;
  onDelete: (id: number) => void;
}

export const TicketKPIProfilesTab: React.FC<TicketKPIProfilesTabProps> = ({
  profiles,
  clients,
  onCreate,
  onEdit,
  onDelete,
}) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">Export Profiles</h3>
      <Button onClick={onCreate}>
        <Plus className="mr-2 h-4 w-4" /> Create Profile
      </Button>
    </div>

    {!profiles || profiles.length === 0 ? (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No profiles yet.
        </CardContent>
      </Card>
    ) : (
      <div className="grid gap-4 md:grid-cols-2">
        {profiles.map((p) => (
          <ProfileCard
            key={p.id}
            profile={p}
            clients={clients}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    )}
  </div>
);
