/**
 * Per-page import dialog.
 *
 * Mounted from an admin page header with that page's target key, so the import
 * is scoped to the data the admin is already looking at. The target picker
 * step is skipped and the sample file offered in the header is generated from
 * that target's own schema.
 */
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Play, RotateCcw } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { LoadingStateWrapper } from "@/components/ui/LoadingStateWrapper";

import { dataImportService } from "../services/dataImportService";
import type { ImportStep, ImportTarget } from "../types/dataImport";
import { useDataImportWizard } from "../pages/hooks/useDataImportWizard";
import { ImportWizardBody } from "./ImportWizardBody";
import { stepCanAdvance } from "./importStepGating";
import { ImportSampleButton } from "./ImportSampleButton";
import { ImportCredentialsDialog } from "./ImportCredentialsDialog";

/** The picker step is skipped: the caller has already chosen the target. */
const STEPS: ImportStep[] = ["upload", "map", "preview", "result"];

const stepLabels: Record<string, string> = {
  upload: "1. Upload file",
  map: "2. Map columns",
  preview: "3. Preview",
  result: "4. Results",
};

interface ImportDialogProps {
  /** The target this page owns, e.g. "clients". */
  targetKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Query keys to invalidate after a successful commit, so the page's table
   * refreshes in place.
   */
  invalidateKeys?: readonly unknown[][];
}

export const ImportDialog: React.FC<ImportDialogProps> = ({
  targetKey,
  open,
  onOpenChange,
  invalidateKeys,
}) => {
  const queryClient = useQueryClient();
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const wizard = useDataImportWizard(targetKey);
  const { state, analyze, preview, commit, reset, goToStep } = wizard;

  const {
    data: targetsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["data_import", "targets"],
    queryFn: () => dataImportService.getTargets(),
    enabled: open,
  });

  const target = useMemo<ImportTarget | null>(
    () => targetsData?.targets.find((t) => t.target_key === targetKey) ?? null,
    [targetsData, targetKey]
  );

  const isWorking = state.isAnalyzing || state.isPreviewing || state.isCommitting;
  const canAdvance = target ? stepCanAdvance(state.step, state, target) : false;

  const handleNext = async () => {
    if (state.step === "upload") {
      await analyze();
      return;
    }
    if (state.step === "map") {
      await preview();
      return;
    }
    if (state.step === "preview") {
      const result = await commit();
      if (!result) return;
      for (const key of invalidateKeys ?? []) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      if (result.credentials?.length) setCredentialsOpen(true);
    }
  };

  const handleBack = () => {
    const index = STEPS.indexOf(state.step as ImportStep);
    if (index > 0) goToStep(STEPS[index - 1]);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const nextLabel = () => {
    if (isWorking) return "Working...";
    if (state.step === "upload") return "Analyze";
    if (state.step === "map") return "Preview";
    return (
      <>
        <Play className="mr-2 h-4 w-4" />
        Commit Import
      </>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Import {target?.display_name ?? "data"}</DialogTitle>
            <DialogDescription>
              {target?.description ??
                "Upload a CSV or Excel file and map its columns to this page's fields."}
            </DialogDescription>
            <div className="pt-2">
              <ImportSampleButton targetKey={target ? targetKey : null} />
            </div>
          </DialogHeader>

          <DialogBody>
            {error ? (
              <ErrorCard title="Failed to load the import target" message={error.message} />
            ) : (
              <LoadingStateWrapper isLoading={isLoading}>
                {!target ? (
                  <ErrorCard
                    title="Import not available"
                    message="This import is not available for your account."
                  />
                ) : (
                  <div className="space-y-6">
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

                    <ImportWizardBody
                      step={state.step as ImportStep}
                      state={state}
                      target={target}
                      wizard={wizard}
                    />
                  </div>
                )}
              </LoadingStateWrapper>
            )}
          </DialogBody>

          <DialogFooter>
            {state.step === "result" ? (
              <>
                <Button variant="outline" onClick={reset}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Import another file
                </Button>
                <Button onClick={() => handleOpenChange(false)}>Done</Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={state.step === "upload" || isWorking}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={handleNext} disabled={!canAdvance || isWorking}>
                  {nextLabel()}
                  {state.step !== "preview" && !isWorking && (
                    <ArrowRight className="ml-2 h-4 w-4" />
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportCredentialsDialog
        open={credentialsOpen}
        onOpenChange={setCredentialsOpen}
        credentials={state.commitResult?.credentials ?? []}
      />
    </>
  );
};
