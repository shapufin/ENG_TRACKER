import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Eye, Wrench } from "lucide-react";
import { FieldMappingGrid } from "./FieldMappingGrid";
import { OUR_FIELDS } from "../constants/fields";
import type { UploadPreview } from "../types/ticketKPI";

interface UploadPreviewPanelProps {
  preview: UploadPreview;
  onImport: (override: boolean) => void;
  isImporting: boolean;
  /** Real column headers read from the uploaded file, offered as mapping
   *  autocomplete suggestions. */
  detectedColumns?: string[];
  /** The mapping currently in effect (profile mapping + any overrides
   *  already applied). Used to seed the "fix mapping" editor. */
  currentMapping: Record<string, string>;
  /** Re-runs preview against the same file with a new field mapping. */
  onRemap: (mapping: Record<string, string>) => void;
  isRemapping: boolean;
  /** Only the profile's creator or an admin may persist a mapping fix back
   *  onto the shared profile — everyone else can still fix their own import. */
  canSaveMapping: boolean;
  saveMappingOverrides: boolean;
  onSaveMappingOverridesChange: (value: boolean) => void;
}

const humanizeIssueLabel = (issueKey: string): string => {
  const field = issueKey.replace(/^missing_/, "");
  const def = OUR_FIELDS.find((f) => f.key === field);
  return def?.label ?? field;
};

export const UploadPreviewPanel: React.FC<UploadPreviewPanelProps> = ({
  preview,
  onImport,
  isImporting,
  detectedColumns,
  currentMapping,
  onRemap,
  isRemapping,
  canSaveMapping,
  saveMappingOverrides,
  onSaveMappingOverridesChange,
}) => {
  const [showMappingFix, setShowMappingFix] = useState(false);
  const [draftMapping, setDraftMapping] = useState(currentMapping);
  const issueEntries = Object.entries(preview.issues || {});

  const handleOpenMappingFix = () => {
    setDraftMapping(currentMapping);
    setShowMappingFix(true);
  };

  return (
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
              You already uploaded {preview.existing_record_count} tickets for this month. Contact
              an administrator to override.
            </span>
          </div>
        )}

        {issueEntries.length > 0 && (
          <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Some fields look unmapped or empty
            </div>
            <ul className="ml-6 list-disc space-y-0.5 text-xs">
              {issueEntries.map(([key, count]) => (
                <li key={key}>
                  {count} row{count === 1 ? "" : "s"} missing {humanizeIssueLabel(key)}
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" onClick={handleOpenMappingFix}>
              <Wrench className="mr-2 h-4 w-4" />
              Fix column mapping
            </Button>
          </div>
        )}

        {!issueEntries.length && (
          <Button variant="ghost" size="sm" onClick={handleOpenMappingFix} className="text-xs">
            <Wrench className="mr-2 h-4 w-4" />
            Fix column mapping
          </Button>
        )}

        {showMappingFix && (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              Map our fields to the actual column names detected in your file, then re-preview.
            </p>
            <FieldMappingGrid
              fields={OUR_FIELDS}
              mapping={draftMapping}
              onChange={setDraftMapping}
              detectedColumns={detectedColumns}
            />
            {canSaveMapping && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="save-mapping-overrides"
                  checked={saveMappingOverrides}
                  onCheckedChange={(checked) => onSaveMappingOverridesChange(checked === true)}
                />
                <Label htmlFor="save-mapping-overrides" className="text-xs font-normal">
                  Save this mapping to the profile for future uploads
                </Label>
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" disabled={isRemapping} onClick={() => onRemap(draftMapping)}>
                {isRemapping ? "Re-checking..." : "Re-preview with this mapping"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowMappingFix(false)}>
                Cancel
              </Button>
            </div>
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
};
