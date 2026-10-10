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
import { SectionHeading } from "@/components/ui/SectionHeading";
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
  target: "Select target",
  upload: "Upload file",
  map: "Map columns",
  preview: "Preview",
  result: "Results",
};

const relativeTime = (iso: string): string => {
  const diffSec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, secs] of units) {
    if (Math.abs(diffSec) >= secs) return rtf.format(Math.round(diffSec / secs), unit);
  }
  return rtf.format(diffSec, "second");
};

const KpiTile: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <GlassCard className="p-4">
    <p className="text-muted-foreground text-xs">{label}</p>
    <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
  </GlassCard>
);

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

  // KPI strip: same history query (and key) as the History tab with no target filter.
  const { data: allBatches } = useQuery({
    queryKey: ["data_import", "batches", "all"],
    queryFn: () => dataImportService.listBatches(),
  });
  const rowsImported = (allBatches ?? []).reduce(
    (sum, b) => sum + b.created_count + b.updated_count,
    0
  );
  const lastImportAt = (allBatches ?? []).reduce<string | null>(
    (latest, b) => (!latest || b.created_at > latest ? b.created_at : latest),
    null
  );

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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Targets" value={targets.length} />
            {allBatches && (
              <>
                <KpiTile label="Imports run" value={allBatches.length} />
                <KpiTile label="Rows imported" value={rowsImported.toLocaleString()} />
                <KpiTile
                  label="Last import"
                  value={lastImportAt ? relativeTime(lastImportAt) : "None yet"}
                />
              </>
            )}
          </div>

          <GlassCard className="p-4">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Import steps">
              {STEPS.map((s, i) => {
                const current = state.step === s;
                const done = i < STEPS.indexOf(state.step as ImportStep);
                return (
                  <li
                    key={s}
                    aria-current={current ? "step" : undefined}
                    className="flex items-center gap-2"
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                        current
                          ? "bg-primary text-primary-foreground"
                          : done
                            ? "bg-tone-success-surface text-tone-success-text"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={`text-xs whitespace-nowrap ${
                        current ? "text-foreground font-medium" : "text-muted-foreground"
                      }`}
                    >
                      {stepLabels[s]}
                    </span>
                    {i < STEPS.length - 1 && (
                      <span aria-hidden="true" className="bg-border h-px w-6 sm:w-10" />
                    )}
                  </li>
                );
              })}
            </ol>
          </GlassCard>

          <SectionHeading
            eyebrow={`Step ${STEPS.indexOf(state.step as ImportStep) + 1} of ${STEPS.length}`}
            title={stepLabels[state.step] ?? ""}
          />

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
