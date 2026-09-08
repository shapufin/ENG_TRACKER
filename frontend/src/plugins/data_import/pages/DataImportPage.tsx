import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingStateWrapper } from "@/components/ui/LoadingStateWrapper";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/context/PermissionContext";
import { Upload, ArrowLeft, ArrowRight, Play, RotateCcw, History } from "lucide-react";

import { dataImportService } from "../services/dataImportService";
import type { ImportTarget } from "../types/dataImport";
import { useDataImportWizard } from "./hooks/useDataImportWizard";
import { useImportProfiles } from "./hooks/useImportProfiles";

import { TargetPicker } from "../components/TargetPicker";
import { ImportFileDropzone } from "../components/ImportFileDropzone";
import { ColumnMappingForm } from "../components/ColumnMappingForm";
import { ImportOptionsPanel } from "../components/ImportOptionsPanel";
import { ImportProfileBar } from "../components/ImportProfileBar";
import { ImportSummaryCards } from "../components/ImportSummaryCards";
import { ImportPreviewTable } from "../components/ImportPreviewTable";
import { ImportCredentialsDialog } from "../components/ImportCredentialsDialog";
import { ValueTransformPanel } from "../components/ValueTransformPanel";
import { ImportHistoryTab } from "../components/ImportHistoryTab";

const STEPS = ["target", "upload", "map", "preview", "result"] as const;
type WizardStep = (typeof STEPS)[number];

const stepLabels: Record<string, string> = {
  target: "1. Select target",
  upload: "2. Upload file",
  map: "3. Map columns",
  preview: "4. Preview",
  result: "5. Results",
};

/** True when the current step's gating requirements are satisfied. */
const stepCanAdvance = (
  step: string,
  state: {
    targetKey: string | null;
    file: File | null;
    isAnalyzing: boolean;
    fieldMapping: Record<string, string | null>;
    defaultValues: Record<string, unknown>;
  },
  target: ImportTarget | null
): boolean => {
  if (step === "target") return !!state.targetKey;
  if (step === "upload") return !!state.file && !state.isAnalyzing;
  if (step === "map") {
    const requiredFields = target?.fields.filter((f) => f.required) ?? [];
    return requiredFields.every(
      (f) => state.fieldMapping[f.key] || state.defaultValues[f.key] !== undefined
    );
  }
  return false;
};

/** Label for the primary action button on each step. */
const nextButtonLabel = (step: string, isWorking: boolean): React.ReactNode => {
  if (isWorking) return "Working...";
  if (step === "upload") return "Analyze";
  if (step === "map") return "Preview";
  if (step === "preview")
    return (
      <>
        <Play className="mr-2 h-4 w-4" />
        Commit Import
      </>
    );
  return (
    <>
      Next <ArrowRight className="ml-2 h-4 w-4" />
    </>
  );
};

interface StepContentProps {
  state: ReturnType<typeof useDataImportWizard>["state"];
  target: ImportTarget | null;
  targets: ImportTarget[];
  targetsLoading: boolean;
  targetsError: Error | null;
  profiles: ReturnType<typeof useImportProfiles>["profiles"];
  wizard: ReturnType<typeof useDataImportWizard>;
  onSetSearchParams: (params: Record<string, string>) => void;
  onSaveProfile: (name: string) => void;
}

/** Renders the body of the current wizard step. */
const WizardStepContent: React.FC<StepContentProps> = ({
  state,
  target,
  targets,
  targetsLoading,
  targetsError,
  profiles,
  wizard,
  onSetSearchParams,
  onSaveProfile,
}) => {
  if (state.step === "target") {
    if (targetsError) {
      return <ErrorCard title="Failed to load import targets" message={targetsError.message} />;
    }
    return (
      <LoadingStateWrapper isLoading={targetsLoading}>
        <TargetPicker
          targets={targets}
          selectedTargetKey={state.targetKey}
          onSelect={(key) => {
            wizard.selectedTarget(key);
            onSetSearchParams({ target: key });
          }}
        />
      </LoadingStateWrapper>
    );
  }

  if (state.step === "upload") {
    return (
      <div className="space-y-4">
        <ImportFileDropzone file={state.file} onFileAccepted={wizard.setFile} />
        {state.analyzeError && <ErrorCard title="Analysis failed" message={state.analyzeError} />}
      </div>
    );
  }

  if (state.step === "map" && target) {
    return (
      <div className="space-y-4">
        <ImportProfileBar
          profiles={profiles}
          targetKey={target.target_key}
          onLoadProfile={wizard.loadProfile}
          onSaveProfile={onSaveProfile}
        />
        <ColumnMappingForm
          fields={target.fields}
          detectedColumns={state.detectedColumns}
          fieldMapping={state.fieldMapping}
          defaultValues={state.defaultValues}
          onFieldMappingChange={wizard.setFieldMapping}
          onDefaultValueChange={wizard.setDefaultValue}
        />
        {target.fields.some((f) => f.field_type === "choice") && (
          <ValueTransformPanel
            fields={target.fields}
            fieldMapping={state.fieldMapping}
            detectedValues={state.detectedValues}
            valueTransforms={state.options.value_transforms ?? {}}
            onTransformChange={wizard.setValueTransform}
          />
        )}
        <ImportOptionsPanel
          targetKey={state.targetKey}
          detectedColumns={state.detectedColumns}
          passwordColumn={state.fieldMapping.password ?? null}
          onPasswordColumnChange={(column) => wizard.setFieldMapping("password", column)}
          options={state.options}
          onChange={wizard.setOption}
        />
      </div>
    );
  }

  if (state.step === "preview" && state.previewResult) {
    return (
      <div className="space-y-4">
        <ImportSummaryCards summary={state.previewResult.summary} mode="preview" />
        <ImportPreviewTable rows={state.previewResult.rows} />
      </div>
    );
  }

  if (state.step === "result" && state.commitResult) {
    return (
      <div className="space-y-4">
        <ImportSummaryCards summary={state.commitResult.summary} mode="commit" />
        {state.commitResult.row_errors.length > 0 && (
          <ErrorCard
            title="Import errors"
            message={`${state.commitResult.row_errors.length} row(s) could not be imported.`}
          />
        )}
      </div>
    );
  }

  return null;
};

export const DataImportPage: React.FC = () => {
  const { isAdmin } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("import");
  const [credentialsOpen, setCredentialsOpen] = useState(false);

  const wizard = useDataImportWizard();
  const { state, selectedTarget, analyze, preview, commit: commitImport, reset, goToStep } = wizard;

  const {
    data: targetsData,
    isLoading: targetsLoading,
    error: targetsError,
  } = useQuery({
    queryKey: ["data_import", "targets"],
    queryFn: () => dataImportService.getTargets(),
  });

  const targets = useMemo<ImportTarget[]>(() => targetsData?.targets ?? [], [targetsData]);
  const target = useMemo(
    () => targets.find((t) => t.target_key === state.targetKey) ?? null,
    [targets, state.targetKey]
  );

  const { profiles, createProfile } = useImportProfiles(state.targetKey);
  const { data: batches } = useQuery({
    queryKey: ["data_import", "batches", state.targetKey ?? "all"],
    queryFn: () => dataImportService.listBatches(state.targetKey ?? undefined),
    enabled: activeTab === "history",
  });

  // Allow deep-linking target from query param
  useEffect(() => {
    const targetParam = searchParams.get("target");
    if (targetParam && !state.targetKey) {
      selectedTarget(targetParam);
    }
  }, [searchParams, state.targetKey, selectedTarget]);

  const canGoNext = useMemo(() => stepCanAdvance(state.step, state, target), [state, target]);

  const handleNext = async () => {
    const idx = STEPS.indexOf(state.step as WizardStep);
    if (state.step === "upload") {
      await analyze();
      return;
    }
    if (state.step === "map") {
      await preview();
      return;
    }
    if (state.step === "preview") {
      const result = await commitImport();
      if (result && result.credentials?.length) {
        setCredentialsOpen(true);
      }
      return;
    }
    if (idx >= 0 && idx < STEPS.length - 1) {
      goToStep(STEPS[idx + 1]);
    }
  };

  const handleBack = () => {
    const idx = STEPS.indexOf(state.step as WizardStep);
    if (idx > 0) {
      goToStep(STEPS[idx - 1]);
    }
  };

  const handleSaveProfile = (name: string) => {
    if (!state.targetKey) return;
    createProfile({
      name,
      target_key: state.targetKey,
      field_mapping: Object.fromEntries(
        Object.entries(state.fieldMapping).filter(([, v]) => v !== null && v !== undefined)
      ) as Record<string, string>,
      default_values: state.defaultValues,
      options: state.options,
      is_active: true,
    });
  };

  if (!isAdmin) {
    return (
      <PageShell title="Data Import">
        <ErrorCard
          title="Access Denied"
          message="Only admin users can access the data import tool."
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Universal Data Import"
      subtitle="Bulk-import users, leave balances, and more from CSV/Excel files."
      actions={
        state.step !== "target" && (
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Start over
          </Button>
        )
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted">
          <TabsTrigger value="import">
            <Upload className="mr-2 h-4 w-4" />
            Import
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-2 h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-6">
          <GlassCard isHoverLift={false} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              {STEPS.map((s) => (
                <div
                  key={s}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                    state.step === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {stepLabels[s]}
                </div>
              ))}
            </div>
          </GlassCard>

          <WizardStepContent
            state={state}
            target={target}
            targets={targets}
            targetsLoading={targetsLoading}
            targetsError={targetsError}
            profiles={profiles}
            wizard={wizard}
            onSetSearchParams={setSearchParams}
            onSaveProfile={handleSaveProfile}
          />

          {state.step !== "target" && state.step !== "result" && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleNext}
                disabled={
                  !canGoNext || state.isAnalyzing || state.isPreviewing || state.isCommitting
                }
              >
                {nextButtonLabel(
                  state.step,
                  state.isAnalyzing || state.isPreviewing || state.isCommitting
                )}
              </Button>
            </div>
          )}

          {state.step === "result" && (
            <div className="flex justify-end">
              <Button onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Start new import
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <ImportHistoryTab batches={batches ?? []} />
        </TabsContent>
      </Tabs>

      <ImportCredentialsDialog
        open={credentialsOpen}
        onOpenChange={setCredentialsOpen}
        credentials={state.commitResult?.credentials ?? []}
      />
    </PageShell>
  );
};
