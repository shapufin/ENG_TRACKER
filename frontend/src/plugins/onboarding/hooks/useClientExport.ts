import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { handleApiError } from "@/lib/error-handler";
import { navigateToDownload } from "@/lib/download";
import { onboardingService } from "../services/onboardingService";
import type { ClientExport } from "../types/onboarding";

const IN_PROGRESS = ["pending", "running"];

interface UseClientExportOptions {
  /** Runs once the browser has followed the link, e.g. to refresh export counts. */
  onDownloaded?: () => void;
}

/**
 * Request an export, wait for the scheduler to build it, then follow the
 * single-use signed link.
 *
 * The ZIP is never fetched as a blob: it can be gigabytes, and the API hands
 * out a short-lived URL that nginx serves straight from disk. One export at a
 * time per hook instance.
 */
export const useClientExport = (options?: UseClientExportOptions) => {
  const qc = useQueryClient();
  const [exportId, setExportId] = useState<number | null>(null);
  const downloadedFor = useRef<number | null>(null);
  const onDownloaded = options?.onDownloaded;

  const status = useQuery({
    queryKey: ["onboarding", "export", exportId],
    queryFn: () => onboardingService.getExport(exportId as number),
    enabled: exportId !== null,
    refetchInterval: (query) =>
      query.state.data && IN_PROGRESS.includes(query.state.data.status) ? 2000 : false,
  });

  const request = useMutation({
    mutationFn: (create: () => Promise<ClientExport>) => create(),
    onSuccess: (created) => {
      downloadedFor.current = null;
      qc.setQueryData(["onboarding", "export", created.id], created);
      setExportId(created.id);
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const exported = status.data;
  useEffect(() => {
    if (!exported || exported.status !== "ready" || downloadedFor.current === exported.id) return;
    downloadedFor.current = exported.id;
    onboardingService
      .getExportDownloadUrl(exported.id)
      .then((url) => {
        navigateToDownload(url);
        onDownloaded?.();
      })
      .catch((err: unknown) => handleApiError(err));
  }, [exported, onDownloaded]);

  return {
    /** `start(() => onboardingService.createClientExport(id))`. */
    start: request.mutate,
    exported,
    working: request.isPending || (!!exported && IN_PROGRESS.includes(exported.status)),
  };
};
