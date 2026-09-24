import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderX } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/hooks/useAuth";
import { ClientPicker } from "../components/ClientPicker";
import { FolderBrowser } from "../components/FolderBrowser";
import { onboardingService } from "../services/onboardingService";

export const OnboardingPage: React.FC = () => {
  const { user } = useAuth();
  const hasAssignedClient = (user?.client_ids?.length ?? 0) > 0;

  const clientsQuery = useQuery({
    queryKey: ["onboarding", "clients"],
    queryFn: onboardingService.getClients,
    enabled: hasAssignedClient,
  });

  const [selectedClientOverride, setSelectedClientOverride] = useState<number | null>(null);
  // Derived, not synced via effect: falls back to the first client whenever
  // no override has been picked yet, or the override no longer matches a
  // loaded client (e.g. the client list changed under it).
  const selectedClientId =
    selectedClientOverride !== null &&
    clientsQuery.data?.some((c) => c.id === selectedClientOverride)
      ? selectedClientOverride
      : clientsQuery.data?.[0]?.id ?? null;

  if (!hasAssignedClient) {
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

  const selectedClient = clientsQuery.data?.find((c) => c.id === selectedClientId) ?? null;

  // Assigned client IDs exist on the user, but none resolved to an active
  // Client row (e.g. every assigned client was deactivated) — without this,
  // the page would render only the header with no body and no explanation.
  if (clientsQuery.data && clientsQuery.data.length === 0) {
    return (
      <PageShell title="Onboarding" subtitle="Client documents">
        <EmptyState
          icon={FolderX}
          title="No active clients"
          description="The clients you're assigned to are no longer active. Ask your team leader for an active assignment."
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Onboarding" subtitle="Client documents">
      <div className="space-y-6">
        {clientsQuery.data && clientsQuery.data.length > 1 && (
          <ClientPicker
            clients={clientsQuery.data}
            selectedId={selectedClientId}
            onSelect={setSelectedClientOverride}
          />
        )}
        {selectedClient && (
          <FolderBrowser clientId={selectedClient.id} clientName={selectedClient.name} />
        )}
      </div>
    </PageShell>
  );
};
