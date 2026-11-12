import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { handleApiError } from "@/lib/error-handler";
import { yearCloseService } from "../services/yearCloseService";
import type { ArchiveCategory } from "../types/yearClose";
import { formatDate } from "./archiveFormat";

interface PurgeDialogProps {
  year: number;
  category: ArchiveCategory | null;
  onClose: () => void;
  onDone: () => void;
}

/** Shows what a removal would delete (a dry run) and only then lets a superuser confirm it. */
export const PurgeDialog: React.FC<PurgeDialogProps> = ({ year, category, onClose, onDone }) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const key = category?.key;

  // A fresh dry run every time the dialog opens; the server also re-checks every gate on confirm.
  const preview = useQuery({
    queryKey: ["year_close", "purge-preview", year, key],
    queryFn: () => yearCloseService.purgeCategory(year, key as string, true),
    enabled: !!key,
    retry: false,
    gcTime: 0,
  });

  const refusal =
    isAxiosError(preview.error) && preview.error.response?.status === 409
      ? ((preview.error.response.data?.reasons as string[] | undefined) ?? [])
      : null;

  const confirm = async () => {
    if (!key) return;
    setIsConfirming(true);
    try {
      await yearCloseService.purgeCategory(year, key, false);
      toast.success(`${category?.label} of ${year} removed.`);
      onDone();
      onClose();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <ConfirmDialog
      open={category !== null}
      onOpenChange={(open) => !open && onClose()}
      title={category ? `Remove ${category.label} of ${year}?` : "Remove archived data"}
      description={
        category
          ? `Kept until ${formatDate(category.remove_on)}. After removal the archive file is the only copy. This cannot be undone.`
          : undefined
      }
      variant="destructive"
      confirmLabel="Remove permanently"
      isConfirming={isConfirming}
      confirmDisabled={!preview.data}
      onConfirm={confirm}
    >
      {preview.isLoading && (
        <p className="text-muted-foreground text-sm">Checking what would be removed...</p>
      )}
      {refusal && (
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          {refusal.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {preview.isError && !refusal && (
        <p className="text-destructive text-sm">Could not check this removal. Try again later.</p>
      )}
      {preview.data && (
        <ul className="space-y-1 text-sm">
          {Object.entries(preview.data.rows).map(([label, count]) => (
            <li key={label} className="flex justify-between gap-4">
              <span>{label}</span>
              <span className="tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </ConfirmDialog>
  );
};
