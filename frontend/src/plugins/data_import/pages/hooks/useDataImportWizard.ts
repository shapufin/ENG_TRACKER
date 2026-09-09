import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { dataImportService } from "../../services/dataImportService";
import type { CommitResult, ImportOptions, ImportStep, WizardState } from "../../types/dataImport";

/**
 * Option values start empty: the importer's schema supplies the defaults, both
 * for display (ImportOptionsPanel) and on the server. Seeding them here would
 * duplicate that schema in the frontend.
 */
const initialOptions: ImportOptions = {};

const buildInitialState = (initialTargetKey?: string): WizardState => ({
  // With a target fixed by the caller (the per-page dialog) the picker step is
  // skipped entirely.
  step: initialTargetKey ? "upload" : "target",
  targetKey: initialTargetKey ?? null,
  file: null,
  detectedColumns: [],
  detectedValues: {},
  fieldMapping: {},
  defaultValues: {},
  options: initialOptions,
  selectedProfileId: null,
  previewResult: null,
  commitResult: null,
  analyzeError: null,
  isAnalyzing: false,
  isPreviewing: false,
  isCommitting: false,
});

/**
 * Drives the import wizard.
 *
 * @param initialTargetKey - Fixes the target and starts at the upload step.
 *
 * Every callback is stable: async actions read the latest state from a ref
 * rather than closing over it, so passing them down does not re-render the
 * whole wizard on each keystroke.
 */
export function useDataImportWizard(initialTargetKey?: string) {
  const [state, setState] = useState<WizardState>(() => buildInitialState(initialTargetKey));

  // Mirrors `state` for the async actions; `setState` stays the only writer.
  const stateRef = useRef(state);
  const update = useCallback((updater: (prev: WizardState) => WizardState) => {
    setState((prev) => {
      const next = updater(prev);
      stateRef.current = next;
      return next;
    });
  }, []);

  const selectedTarget = useCallback(
    (targetKey: string) => {
      update((prev) => ({
        ...prev,
        ...buildInitialState(targetKey),
        step: "upload",
        file: prev.targetKey === targetKey ? prev.file : null,
      }));
    },
    [update]
  );

  const setFile = useCallback(
    (file: File | null) => {
      update((prev) => ({
        ...prev,
        file,
        detectedColumns: [],
        detectedValues: {},
        fieldMapping: {},
        previewResult: null,
        commitResult: null,
        analyzeError: null,
      }));
    },
    [update]
  );

  const analyze = useCallback(async () => {
    const { file, targetKey } = stateRef.current;
    if (!file || !targetKey) return;

    update((prev) => ({ ...prev, isAnalyzing: true, analyzeError: null }));
    try {
      const result = await dataImportService.analyze(file, targetKey);
      update((prev) => ({
        ...prev,
        detectedColumns: result.detected_columns,
        detectedValues: result.detected_values ?? {},
        fieldMapping: Object.fromEntries(
          Object.entries(result.suggested_mapping).map(([key, value]) => [key, value ?? null])
        ),
        step: "map",
        isAnalyzing: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to analyze file";
      update((prev) => ({ ...prev, isAnalyzing: false, analyzeError: message }));
      toast.error(message);
    }
  }, [update]);

  const setFieldMapping = useCallback(
    (fieldKey: string, column: string | null) => {
      update((prev) => ({
        ...prev,
        fieldMapping: { ...prev.fieldMapping, [fieldKey]: column },
      }));
    },
    [update]
  );

  const setDefaultValue = useCallback(
    (fieldKey: string, value: unknown) => {
      update((prev) => ({
        ...prev,
        defaultValues: { ...prev.defaultValues, [fieldKey]: value },
      }));
    },
    [update]
  );

  const setOption = useCallback(
    (key: string, value: unknown) => {
      update((prev) => ({ ...prev, options: { ...prev.options, [key]: value } }));
    },
    [update]
  );

  const setValueTransform = useCallback(
    (fieldKey: string, rawValue: string, canonicalValue: string | null) => {
      update((prev) => {
        const existing = prev.options.value_transforms?.[fieldKey] ?? {};
        const updated = { ...existing };
        if (canonicalValue === null || canonicalValue === undefined) {
          delete updated[rawValue];
        } else {
          updated[rawValue] = canonicalValue;
        }
        return {
          ...prev,
          options: {
            ...prev.options,
            value_transforms: { ...prev.options.value_transforms, [fieldKey]: updated },
          },
        };
      });
    },
    [update]
  );

  const loadProfile = useCallback(
    (profile: {
      field_mapping: Record<string, string>;
      default_values: Record<string, unknown>;
      options: ImportOptions;
    }) => {
      update((prev) => ({
        ...prev,
        fieldMapping: Object.fromEntries(
          Object.entries(profile.field_mapping).map(([key, value]) => [key, value ?? null])
        ),
        defaultValues: profile.default_values ?? {},
        options: { ...initialOptions, ...(profile.options ?? {}) },
      }));
    },
    [update]
  );

  const preview = useCallback(async () => {
    const { file, targetKey, fieldMapping, defaultValues, options } = stateRef.current;
    if (!file || !targetKey) return;

    update((prev) => ({ ...prev, isPreviewing: true, previewResult: null }));
    try {
      const result = await dataImportService.preview(
        file,
        targetKey,
        fieldMapping,
        defaultValues,
        options
      );
      update((prev) => ({
        ...prev,
        previewResult: result,
        step: "preview",
        isPreviewing: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to preview import";
      update((prev) => ({ ...prev, isPreviewing: false }));
      toast.error(message);
    }
  }, [update]);

  const commit = useCallback(
    async (saveProfile?: { name: string }): Promise<CommitResult | undefined> => {
      const { file, targetKey, fieldMapping, defaultValues, options } = stateRef.current;
      if (!file || !targetKey) return;

      update((prev) => ({ ...prev, isCommitting: true, commitResult: null }));
      try {
        const result = await dataImportService.commit(
          file,
          targetKey,
          fieldMapping,
          defaultValues,
          options,
          saveProfile
        );
        update((prev) => ({
          ...prev,
          commitResult: result,
          step: "result",
          isCommitting: false,
        }));
        toast.success(
          `Import complete: ${result.summary.created} created, ${result.summary.updated} updated, ${result.summary.error} errors`
        );
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to commit import";
        update((prev) => ({ ...prev, isCommitting: false }));
        toast.error(message);
      }
    },
    [update]
  );

  const reset = useCallback(() => {
    update(() => buildInitialState(initialTargetKey));
  }, [update, initialTargetKey]);

  const goToStep = useCallback(
    (step: ImportStep) => {
      update((prev) => ({ ...prev, step }));
    },
    [update]
  );

  return {
    state,
    selectedTarget,
    setFile,
    analyze,
    setFieldMapping,
    setDefaultValue,
    setValueTransform,
    setOption,
    loadProfile,
    preview,
    commit,
    reset,
    goToStep,
  };
}
