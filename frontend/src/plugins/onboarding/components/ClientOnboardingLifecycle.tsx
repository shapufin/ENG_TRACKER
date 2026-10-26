import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { handleApiError } from "@/lib/error-handler";
import { navigateToDownload } from "@/lib/download";
import type { Client } from "@/types";
import { onboardingService } from "../services/onboardingService";

interface ClientOnboardingLifecycleProps {
  client: Client;
}

const IN_PROGRESS = ["pending", "running"];

/**
 * Export and purge for one archived client's onboarding data, shown inside the Clients
 * page's archived-data dialog. Export builds a ZIP in the background (the scheduler),
 * then the browser follows a single-use link that nginx serves from disk.
 */
const ClientOnboardingLifecycle: React.FC<ClientOnboardingLifecycleProps> = ({ client }) => {
  const qc = useQueryClient();
  const [exportId, setExportId] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const downloadedFor = useRef<number | null>(null);
  const infoKey = ["onboarding", "client-lifecycle", client.id];

  const info = useQuery({
    queryKey: infoKey,
    queryFn: () => onboardingService.getClientLifecycle(client.id),
  });

  const exportQuery = useQuery({
    queryKey: ["onboarding", "export", exportId],
    queryFn: () => onboardingService.getExport(exportId as number),
    enabled: exportId !== null,
    refetchInterval: (query) =>
      query.state.data && IN_PROGRESS.includes(query.state.data.status) ? 2000 : false,
  });

  const createExport = useMutation({
    mutationFn: () => onboardingService.createClientExport(client.id),
    onSuccess: (created) => {
      downloadedFor.current = null;
      qc.setQueryData(["onboarding", "export", created.id], created);
      setExportId(created.id);
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const exported = exportQuery.data;
  useEffect(() => {
    if (!exported || exported.status !== "ready" || downloadedFor.current === exported.id) return;
    downloadedFor.current = exported.id;
    onboardingService
      .getExportDownloadUrl(exported.id)
      .then((url) => {
        navigateToDownload(url);
        qc.invalidateQueries({ queryKey: infoKey });
      })
      .catch((err: unknown) => handleApiError(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- infoKey is derived from client.id
  }, [exported, qc]);

  const purge = useMutation({
    mutationFn: () => onboardingService.purgeClientOnboarding(client.id, typed),
    onSuccess: (result) => {
      toast.success(`Purged ${result.documents} documents and ${result.folders} folders`);
      setTyped("");
      qc.invalidateQueries({ queryKey: infoKey });
      // The client's own lifecycle (can it be deleted now?) and list live under this prefix.
      qc.invalidateQueries({ queryKey: ["overtime", "clients"] });
    },
    onError: (err: unknown) => handleApiError(err),
  });

  if (info.isLoading || !info.data) return null;
  const { folders, documents, can_purge: canPurge, blockers } = info.data;
  if (folders === 0 && documents === 0) {
    return <p className="text-sm text-muted-foreground">No onboarding data</p>;
  }

  const working = createExport.isPending || (!!exported && IN_PROGRESS.includes(exported.status));
  const inputId = `purge-client-${client.id}`;

  return (
    <section aria-label="Onboarding data" className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Onboarding data</h3>
        <p className="text-sm text-muted-foreground">
          {folders} folder{folders === 1 ? "" : "s"}, {documents} document
          {documents === 1 ? "" : "s"}
        </p>
        <Button type="button" variant="outline" disabled={working} onClick={() => createExport.mutate()}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Download ZIP
        </Button>
        {working && (
          <p role="status" className="text-sm text-muted-foreground">
            Preparing the ZIP. The download starts when it is ready.
          </p>
        )}
        {exported?.status === "failed" && (
          <p role="alert" className="text-sm text-destructive">
            Export failed: {exported.error || "unknown error"}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Purge onboarding data</h3>
        <p className="text-sm text-muted-foreground">
          Removes the folders, documents and files. The client and all its records stay.
        </p>
        {!canPurge && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
        <Label htmlFor={inputId}>Type {client.code} to purge</Label>
        <Input
          id={inputId}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          disabled={!canPurge}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="destructive"
          disabled={!canPurge || typed !== client.code || purge.isPending}
          onClick={() => purge.mutate()}
        >
          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Purge onboarding data
        </Button>
      </div>
    </section>
  );
};

export default ClientOnboardingLifecycle;
