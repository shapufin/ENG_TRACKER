import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FolderX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/layout/PageShell";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { ClientPicker } from "../components/ClientPicker";
import { FolderBrowser } from "../components/FolderBrowser";
import { useClientExport } from "../hooks/useClientExport";
import { onboardingService } from "../services/onboardingService";

const ARCHIVE_BANNER_ID = "onboarding-archive-banner";

export const OnboardingPage: React.FC = () => {
  const { user } = useAuth();
  const { canExport } = usePluginPermissions();
  const isSuperuser = !!user?.is_superuser;
  const hasAssignedClient = (user?.client_ids?.length ?? 0) > 0;

  const [showArchived, setShowArchived] = useState(false);
  // Archived clients are not assigned to anyone (archive unassigns them), so a
  // superuser with no assignments still has to reach this list.
  const archivedMode = showArchived && isSuperuser;

  const clientsQuery = useQuery({
    queryKey: archivedMode ? ["onboarding", "clients", "archived"] : ["onboarding", "clients"],
    queryFn: archivedMode ? onboardingService.getArchivedClients : onboardingService.getClients,
    enabled: hasAssignedClient || isSuperuser,
  });

  const [selectedClientOverride, setSelectedClientOverride] = useState<number | null>(null);
  // Derived, not synced via effect: falls back to the first client whenever
  // no override has been picked yet, or the override no longer matches a
  // loaded client (e.g. the client list changed under it).
  const selectedClientId =
    selectedClientOverride !== null &&
    clientsQuery.data?.some((c) => c.id === selectedClientOverride)
      ? selectedClientOverride
      : (clientsQuery.data?.[0]?.id ?? null);

  const selectedClient = clientsQuery.data?.find((c) => c.id === selectedClientId) ?? null;

  const clientZip = useClientExport();
  const allZip = useClientExport();

  const canDownloadZip = isSuperuser || canExport("onboarding");

  if (!hasAssignedClient && !isSuperuser) {
    return (
      <PageShell title="Onboarding" subtitle="Client documents">
        <EmptyState
          icon={FolderX}
          title="No clients assigned"
          description="Ask your team leader to assign you to a client to see its documents."
        />
      </PageShell>
    );
  }

  if (clientsQuery.isError) {
    return (
      <PageShell title="Onboarding" subtitle="Client documents">
        <ErrorCard onRetry={() => clientsQuery.refetch()} />
      </PageShell>
    );
  }

  // Assigned client IDs exist on the user, but none resolved to an active
  // Client row (e.g. every assigned client was deactivated) — without this,
  // the page would render only the header with no body and no explanation.
  if (clientsQuery.data && clientsQuery.data.length === 0) {
    return (
      <PageShell title="Onboarding" subtitle="Client documents">
        {isSuperuser && <ArchivedToggle checked={showArchived} onChange={setShowArchived} />}
        <EmptyState
          icon={FolderX}
          title={archivedMode ? "No archived clients" : "No active clients"}
          description={
            archivedMode
              ? "Every client is active. Archived clients appear here after they are retired."
              : "The clients you're assigned to are no longer active. Ask your team leader for an active assignment."
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Onboarding" subtitle="Client documents">
      <div className="space-y-6">
        {(isSuperuser || canDownloadZip) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {isSuperuser ? (
              <ArchivedToggle checked={showArchived} onChange={setShowArchived} />
            ) : (
              <div />
            )}
            <div className="flex flex-wrap gap-2">
              {canDownloadZip && selectedClient && (
                <Button
                  variant="outline"
                  disabled={clientZip.working}
                  onClick={() =>
                    clientZip.start(() => onboardingService.createClientExport(selectedClient.id))
                  }
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  Download {selectedClient.name} ZIP
                </Button>
              )}
              {isSuperuser && (
                <Button
                  variant="outline"
                  disabled={allZip.working}
                  onClick={() => allZip.start(onboardingService.createAllClientsExport)}
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  Export all clients
                </Button>
              )}
            </div>
          </div>
        )}

        {(clientZip.working || allZip.working) && (
          <p role="status" className="text-muted-foreground text-sm">
            Preparing the ZIP. The download starts when it is ready.
          </p>
        )}
        {[clientZip.exported, allZip.exported]
          .filter((exported) => exported?.status === "failed")
          .map((exported) => (
            <p key={exported!.id} role="alert" className="text-destructive text-sm">
              Export failed: {exported!.error || "unknown error"}
            </p>
          ))}

        {archivedMode && (
          <div
            id={ARCHIVE_BANNER_ID}
            role="status"
            className="bg-tone-neutral-surface text-tone-neutral-text rounded-xl px-4 py-3 text-sm"
          >
            Archived clients are read-only. Their folders and files can be browsed, downloaded and
            exported, but not edited.
          </div>
        )}

        {clientsQuery.data && clientsQuery.data.length > 1 && (
          <ClientPicker
            clients={clientsQuery.data}
            selectedId={selectedClientId}
            onSelect={setSelectedClientOverride}
          />
        )}
        {selectedClient && (
          <FolderBrowser
            clientId={selectedClient.id}
            clientName={selectedClient.name}
            readOnly={archivedMode}
          />
        )}
      </div>
    </PageShell>
  );
};

const ArchivedToggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ checked, onChange }) => (
  <div className="flex items-center gap-2">
    <Switch id="onboarding-show-archived" checked={checked} onCheckedChange={onChange} />
    <Label htmlFor="onboarding-show-archived">Show archived clients</Label>
  </div>
);
