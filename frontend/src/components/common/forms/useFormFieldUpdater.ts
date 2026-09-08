import { useCallback } from "react";

type FormValues = object;
type FormErrors = object;

export function useFormFieldUpdater<T extends FormValues, E extends FormErrors>(
  form: T,
  errors: E,
  onFormChange: (nextForm: T) => void,
  onErrorsChange: (nextErrors: E) => void
) {
  return useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      onFormChange({ ...form, [key]: value });
      if (key in errors) {
        onErrorsChange({ ...errors, [key]: undefined });
      }
    },
    [errors, form, onErrorsChange, onFormChange]
  );
}
