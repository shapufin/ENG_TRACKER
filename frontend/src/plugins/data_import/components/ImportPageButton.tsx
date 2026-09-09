/**
 * The import entry point for one admin page: a header button plus its dialog.
 *
 * Visibility comes from the server's target list, which already excludes
 * targets the caller may not import, so the button never appears for someone
 * who would be refused — and there is no client-side copy of the authority
 * rules to drift.
 */
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dataImportService } from "../services/dataImportService";
import { ImportDialog } from "./ImportDialog";

interface ImportPageButtonProps {
  /** The target this page owns, e.g. "clients". */
  targetKey: string;
  /** Button label. Defaults to "Import". */
  label?: string;
  /** Query keys to invalidate after a successful commit. */
  invalidateKeys?: readonly unknown[][];
}

export const ImportPageButton: React.FC<ImportPageButtonProps> = ({
  targetKey,
  label = "Import",
  invalidateKeys,
}) => {
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["data_import", "targets"],
    queryFn: () => dataImportService.getTargets(),
    // The plugin may be disabled entirely; a failure just hides the button.
    retry: false,
  });

  const isAvailable = !!data?.targets.some((t) => t.target_key === targetKey);
  if (!isAvailable) return null;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload className="mr-1 h-4 w-4" />
        {label}
      </Button>
      <ImportDialog
        targetKey={targetKey}
        open={open}
        onOpenChange={setOpen}
        invalidateKeys={invalidateKeys}
      />
    </>
  );
};
