/**
 * The body of the import wizard for a chosen target.
 *
 * Shared by the per-page ImportDialog and the full DataImportPage so mapping,
 * options, preview and results have exactly one implementation.
 */
import React from "react";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Progress } from "@/components/ui/progress";
import { DataTable } from "@/components/ui/DataTable";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ImportTarget, ImportStep, PreviewResult, CommitResult } from "../types/dataImport";
import type { useDataImportWizard } from "../pages/hooks/useDataImportWizard";
import type { useImportProfiles } from "../pages/hooks/useImportProfiles";

import { ImportFileDropzone } from "./ImportFileDropzone";
import { ColumnMappingForm } from "./ColumnMappingForm";
import { ImportOptionsPanel } from "./ImportOptionsPanel";
import { ImportProfileBar } from "./ImportProfileBar";
import { ImportSummaryCards } from "./ImportSummaryCards";
import { ImportPreviewTable } from "./ImportPreviewTable";
import { ValueTransformPanel } from "./ValueTransformPanel";
import { rowErrorColumns } from "./rowErrors";

type Wizard = ReturnType<typeof useDataImportWizard>;

interface ImportWizardBodyProps {
  step: ImportStep;
  state: Wizard["state"];
  target: ImportTarget;
  wizard: Wizard;
  /** Omit to hide the saved-mapping bar (the per-page dialog does). */
  profiles?: ReturnType<typeof useImportProfiles>["profiles"];
  onSaveProfile?: (name: string) => void;
}

export const ImportWizardBody: React.FC<ImportWizardBodyProps> = ({
  step,
  state,
  target,
  wizard,
  profiles,
  onSaveProfile,
}) => {
  const isWorking = state.isAnalyzing || state.isPreviewing || state.isCommitting;
  const progressBar = isWorking ? (
    <div className="space-y-1" role="status" aria-live="polite">
      <Progress value={state.uploadProgress ?? 0} aria-label="Import upload progress" />
      <p className="text-xs text-muted-foreground">
        {state.uploadProgress !== null && state.uploadProgress < 100
          ? `Uploading file… ${state.uploadProgress}%`
          : "Processing on the server…"}
      </p>
    </div>
  ) : null;

  if (step === "upload") {
    return (
      <div className="space-y-4">
        {progressBar}
        <ImportFileDropzone file={state.file} onFileAccepted={wizard.setFile} />
        {state.analyzeError && <ErrorCard title="Analysis failed" message={state.analyzeError} />}
      </div>
    );
  }

  if (step === "map") {
    return (
      <div className="space-y-4">
        {progressBar}
        {profiles && onSaveProfile && (
          <ImportProfileBar
            profiles={profiles}
            targetKey={target.target_key}
            onLoadProfile={wizard.loadProfile}
            onSaveProfile={onSaveProfile}
          />
        )}
        <ColumnMappingForm
          fields={target.fields}
          detectedColumns={state.detectedColumns}
          fieldMapping={state.fieldMapping}
          defaultValues={state.defaultValues}
          onFieldMappingChange={wizard.setFieldMapping}
          onDefaultValueChange={wizard.setDefaultValue}
        />
        {target.fields.some((f) => f.choices && f.choices.length > 0) && (
          <ValueTransformPanel
            fields={target.fields}
            fieldMapping={state.fieldMapping}
            detectedValues={state.detectedValues}
            valueTransforms={state.options.value_transforms ?? {}}
            onTransformChange={wizard.setValueTransform}
          />
        )}
        <ImportOptionsPanel
          optionSchema={target.options}
          detectedColumns={state.detectedColumns}
          passwordColumn={state.fieldMapping.password ?? null}
          onPasswordColumnChange={(column) => wizard.setFieldMapping("password", column)}
          options={state.options}
          onChange={wizard.setOption}
        />
      </div>
    );
  }

  if (step === "preview" && state.previewResult) {
    const preview: PreviewResult = state.previewResult;
    return (
      <div className="space-y-4">
        {progressBar}
        <ImportSummaryCards summary={preview.summary} mode="preview" />
        <ImportPreviewTable rows={preview.rows} />
      </div>
    );
  }

  if (step === "result" && state.commitResult) {
    const commit: CommitResult = state.commitResult;
    return (
      <div className="space-y-4">
        <ImportSummaryCards summary={commit.summary} mode="commit" />
        {commit.row_errors.length > 0 && (
          <GlassCard isHoverLift={false}>
            <CardHeader>
              <CardTitle>{commit.row_errors.length} row(s) could not be imported</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={rowErrorColumns}
                data={commit.row_errors}
                pageSize={5}
                emptyMessage="No row errors."
              />
            </CardContent>
          </GlassCard>
        )}
      </div>
    );
  }

  return null;
};
