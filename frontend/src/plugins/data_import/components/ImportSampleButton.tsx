/**
 * Downloads a target's sample file.
 *
 * The sample is generated server-side from the importer's own schema, so the
 * columns it shows are always exactly the columns that target accepts.
 */
import React, { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dataImportService } from "../services/dataImportService";
import type { TemplateFormat } from "../types/dataImport";

interface ImportSampleButtonProps {
  targetKey: string | null;
}

export const ImportSampleButton: React.FC<ImportSampleButtonProps> = ({ targetKey }) => {
  const [downloading, setDownloading] = useState<TemplateFormat | null>(null);

  if (!targetKey) return null;

  const download = async (fileFormat: TemplateFormat) => {
    setDownloading(fileFormat);
    try {
      await dataImportService.downloadTemplate(targetKey, fileFormat);
    } catch {
      toast.error("Could not download the sample file.");
    } finally {
      setDownloading(null);
    }
  };

  const icon = (fileFormat: TemplateFormat) =>
    downloading === fileFormat ? (
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
    ) : (
      <Download className="mr-2 h-4 w-4" />
    );

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={downloading !== null}
        onClick={() => download("csv")}
      >
        {icon("csv")}
        Sample CSV
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={downloading !== null}
        onClick={() => download("xlsx")}
      >
        {icon("xlsx")}
        Sample Excel
      </Button>
    </div>
  );
};
