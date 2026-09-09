/**
 * Cross-target import workspace.
 *
 * Each admin page also opens its own scoped ImportDialog; this page adds the
 * target picker, saved mapping profiles and the batch history. Wizard steps
 * are rendered by the shared ImportWizardBody so there is one implementation
 * of mapping, options, preview and results.
 */
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
import type { ImportStep, ImportTarget } from "../types/dataImport";
import { useDataImportWizard } from "./hooks/useDataImportWizard";
import { useImportProfiles } from "./hooks/useImportProfiles";

import { TargetPicker } from "../components/TargetPicker";
import { ImportCredentialsDialog } from "../components/ImportCredentialsDialog";
import { ImportHistoryTab } from "../components/ImportHistoryTab";
import { ImportSampleButton } from "../components/ImportSampleButton";
import { ImportWizardBody } from "../components/ImportWizardBody";
import { stepCanAdvance } from "../components/importStepGating";

const STEPS: ImportStep[] = ["target", "upload", "map", "preview", "result"];

const stepLabels: Record<string, string> = {
  target: "1. Select target",
  upload: "2. Upload file",
  map: "3. Map columns",
  preview: "4. Preview",
  result: "5. Results",
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
    const idx = STEPS.indexOf(state.step as ImportStep);
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
    const idx = STEPS.indexOf(state.step as ImportStep);
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
      subtitle="Bulk-import users, clients, teams, skills and more from CSV/Excel files."
      actions={
        state.step !== "target" && (
          <div className="flex flex-wrap items-center gap-2">
            <ImportSampleButton targetKey={state.targetKey} />
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Start over
            </Button>
          </div>
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

          {state.step === "target" ? (
            targetsError ? (
              <ErrorCard title="Failed to load import targets" message={targetsError.message} />
            ) : (
              <LoadingStateWrapper isLoading={targetsLoading}>
                <TargetPicker
                  targets={targets}
                  selectedTargetKey={state.targetKey}
                  onSelect={(key) => {
                    selectedTarget(key);
                    setSearchParams({ target: key });
                  }}
                />
              </LoadingStateWrapper>
            )
          ) : (
            target && (
              <ImportWizardBody
                step={state.step as ImportStep}
                state={state}
                target={target}
                wizard={wizard}
                profiles={profiles}
                onSaveProfile={handleSaveProfile}
              />
            )
          )}

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
