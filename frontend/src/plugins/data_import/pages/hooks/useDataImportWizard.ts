import { useCallback, useState } from "react";
import { toast } from "sonner";
import { dataImportService } from "../../services/dataImportService";
import type { CommitResult, ImportOptions, ImportStep, WizardState } from "../../types/dataImport";

const initialOptions: ImportOptions = {
  update_existing: false,
  match_by_email: false,
  password_strategy: "generate",
  overwrite_existing_password: false,
};

const initialState: WizardState = {
  step: "target",
  targetKey: null,
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
};

export function useDataImportWizard() {
  const [state, setState] = useState<WizardState>(initialState);

  const selectedTarget = useCallback((targetKey: string) => {
    setState((prev) => ({
      ...prev,
      targetKey,
      step: "upload",
      detectedColumns: [],
      detectedValues: {},
      fieldMapping: {},
      defaultValues: {},
      options: initialOptions,
      selectedProfileId: null,
      previewResult: null,
      commitResult: null,
      analyzeError: null,
    }));
  }, []);

  const setFile = useCallback((file: File | null) => {
    setState((prev) => ({
      ...prev,
      file,
      detectedColumns: [],
      detectedValues: {},
      fieldMapping: {},
      previewResult: null,
      commitResult: null,
      analyzeError: null,
    }));
  }, []);

  const analyze = useCallback(async () => {
    const { file, targetKey } = state;
    if (!file || !targetKey) return;

    setState((prev) => ({ ...prev, isAnalyzing: true, analyzeError: null }));
    try {
      const result = await dataImportService.analyze(file, targetKey);
      setState((prev) => ({
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
      setState((prev) => ({ ...prev, isAnalyzing: false, analyzeError: message }));
      toast.error(message);
    }
  }, [state]);

  const setFieldMapping = useCallback((fieldKey: string, column: string | null) => {
    setState((prev) => ({
      ...prev,
      fieldMapping: { ...prev.fieldMapping, [fieldKey]: column },
    }));
  }, []);

  const setDefaultValue = useCallback((fieldKey: string, value: unknown) => {
    setState((prev) => ({
      ...prev,
      defaultValues: { ...prev.defaultValues, [fieldKey]: value },
    }));
  }, []);

  const setOption = useCallback(
    <K extends keyof ImportOptions>(key: K, value: ImportOptions[K]) => {
      setState((prev) => ({
        ...prev,
        options: { ...prev.options, [key]: value },
      }));
    },
    []
  );

  const setValueTransform = useCallback(
    (fieldKey: string, rawValue: string, canonicalValue: string | null) => {
      setState((prev) => {
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
    []
  );

  const loadProfile = useCallback(
    (profile: {
      field_mapping: Record<string, string>;
      default_values: Record<string, unknown>;
      options: ImportOptions;
    }) => {
      setState((prev) => ({
        ...prev,
        fieldMapping: Object.fromEntries(
          Object.entries(profile.field_mapping).map(([key, value]) => [key, value ?? null])
        ),
        defaultValues: profile.default_values ?? {},
        options: { ...initialOptions, ...(profile.options ?? {}) },
      }));
    },
    []
  );

  const preview = useCallback(async () => {
    const { file, targetKey, fieldMapping, defaultValues, options } = state;
    if (!file || !targetKey) return;

    setState((prev) => ({ ...prev, isPreviewing: true, previewResult: null }));
    try {
      const result = await dataImportService.preview(
        file,
        targetKey,
        fieldMapping,
        defaultValues,
        options
      );
      setState((prev) => ({
        ...prev,
        previewResult: result,
        step: "preview",
        isPreviewing: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to preview import";
      setState((prev) => ({ ...prev, isPreviewing: false }));
      toast.error(message);
    }
  }, [state]);

  const commit = useCallback(
    async (saveProfile?: { name: string }): Promise<CommitResult | undefined> => {
      const { file, targetKey, fieldMapping, defaultValues, options } = state;
      if (!file || !targetKey) return;

      setState((prev) => ({ ...prev, isCommitting: true, commitResult: null }));
      try {
        const result = await dataImportService.commit(
          file,
          targetKey,
          fieldMapping,
          defaultValues,
          options,
          saveProfile
        );
        setState((prev) => ({
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
        setState((prev) => ({ ...prev, isCommitting: false }));
        toast.error(message);
      }
    },
    [state]
  );

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const goToStep = useCallback((step: ImportStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

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
