/**
 * Step gating for the import wizard, shared by the per-page dialog and the
 * full-page wizard so both agree on when a step is complete.
 */
import type { ImportStep, ImportTarget, WizardState } from "../types/dataImport";

type GatingState = Pick<
  WizardState,
  "targetKey" | "file" | "isAnalyzing" | "fieldMapping" | "defaultValues"
>;

/** True when the step's gating requirements are satisfied. */
export const stepCanAdvance = (
  step: ImportStep,
  state: GatingState,
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
