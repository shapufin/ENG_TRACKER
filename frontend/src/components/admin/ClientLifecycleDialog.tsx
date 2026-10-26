import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { overtimeService } from "@/services/overtimeService";
import type { Client } from "@/types";
import { PluginClientOnboarding } from "./PluginClientOnboarding";

const LABELS: Record<string, string> = {
  overtime_logs: "Overtime logs",
  standby_logs: "Standby logs",
  ticket_import_batches: "Ticket imports",
  export_profiles: "Export profiles",
  ticket_kpi_evidence: "KPI evidence",
  onboarding_folders: "Folders",
  onboarding_documents: "Documents",
};

const labelOf = (key: string) => LABELS[key] ?? key.replace(/_/g, " ");

interface ClientLifecycleDialogProps {
  client: Client;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (id: number) => void;
  isDeleting: boolean;
}

const CountRows: React.FC<{ title: string; counts: Record<string, number> }> = ({
  title,
  counts,
}) => {
  const entries = Object.entries(counts);
  return (
    <section aria-label={title} className="space-y-1">
      <h3 className="text-sm font-medium">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          {entries.map(([key, count]) => (
            <React.Fragment key={key}>
              <dt className="text-muted-foreground">{labelOf(key)}</dt>
              <dd className="tabular-nums">{count}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
    </section>
  );
};

/**
 * Everything tied to an archived client, and the one path to deleting it.
 *
 * Deleting is only offered for a client with no records and no onboarding data, so the
 * onboarding panel (export, then purge) is what unlocks it. The server enforces the same.
 */
export const ClientLifecycleDialog: React.FC<ClientLifecycleDialogProps> = ({
  client,
  open,
  onOpenChange,
  onDelete,
  isDeleting,
}) => {
  const [typed, setTyped] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["overtime", "clients", "lifecycle", client.id],
    queryFn: () => overtimeService.getClientLifecycle(client.id),
  });
  const inputId = `delete-client-${client.id}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{client.name}: archived data</DialogTitle>
          <DialogDescription>
            Archiving keeps every record. Export and purge the onboarding files to free their
            storage; a client with nothing left can be deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {isLoading || !data ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading...
            </p>
          ) : (
            <>
              <section aria-label="Overview" className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Assigned users: </span>
                  <span className="tabular-nums">{data.assigned_users}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Last activity: </span>
                  <span>{data.last_activity ?? "No activity"}</span>
                </p>
              </section>
              <CountRows title="Records kept" counts={data.counts} />
              <CountRows title="Onboarding data" counts={data.cascade_counts} />
              <PluginClientOnboarding client={client} />
              {data.can_delete ? (
                <section aria-label="Delete client" className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    This client has no records and no onboarding data. Deleting it is permanent.
                  </p>
                  <Label htmlFor={inputId}>Type {client.code} to confirm</Label>
                  <Input
                    id={inputId}
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={typed !== client.code || isDeleting}
                    onClick={() => onDelete(client.id)}
                  >
                    Delete client
                  </Button>
                </section>
              ) : (
                <section aria-label="Why it cannot be deleted" className="space-y-1">
                  <h3 className="text-sm font-medium">Cannot be deleted yet</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {data.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
