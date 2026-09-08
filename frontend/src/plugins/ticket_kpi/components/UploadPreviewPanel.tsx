import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Eye } from "lucide-react";
import type { UploadPreview } from "../types/ticketKPI";

interface UploadPreviewPanelProps {
  preview: UploadPreview;
  onImport: (override: boolean) => void;
  isImporting: boolean;
}

export const UploadPreviewPanel: React.FC<UploadPreviewPanelProps> = ({
  preview,
  onImport,
  isImporting,
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg">
        <Eye className="h-5 w-5 text-primary" />
        Preview ({preview.total_records} records)
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {preview.has_existing_upload && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span>
            You already uploaded {preview.existing_record_count} tickets for this month. Contact an
            administrator to override.
          </span>
        </div>
      )}

      {preview.errors.length > 0 && (
        <div className="space-y-1">
          {preview.errors.map((err, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm text-destructive"
            >
              <AlertTriangle className="h-4 w-4" />
              {err}
            </div>
          ))}
        </div>
      )}

      {preview.preview_rows && preview.preview_rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                {Object.keys(preview.preview_rows[0]).map((k) => (
                  <th key={k} className="px-3 py-2 text-left font-medium">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.preview_rows.map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((v, j) => (
                    <td key={j} className="px-3 py-2">
                      {String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {Object.entries(preview.status_breakdown).map(([status, count]) => (
          <Badge key={status} variant="outline">
            {status}: {count}
          </Badge>
        ))}
        {Object.entries(preview.priority_breakdown).map(([priority, count]) => (
          <Badge key={priority} variant="secondary">
            {priority}: {count}
          </Badge>
        ))}
        {Object.entries(preview.category_breakdown).map(([category, count]) => (
          <Badge key={category}>
            {category}: {count}
          </Badge>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => onImport(false)}
          disabled={isImporting || preview.errors.length > 0}
          className="flex-1"
        >
          {isImporting ? "Importing..." : "Import"}
        </Button>
        <Button
          variant="outline"
          onClick={() => onImport(true)}
          disabled={isImporting || !preview.has_existing_upload}
          className="flex-1"
        >
          Override
        </Button>
      </div>
    </CardContent>
  </Card>
);
