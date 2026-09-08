import type React from "react";

interface UseHoursLogSubmitOptions<T extends { id: number }> {
  validateForm: () => boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildPayload: () => any;
  editing: T | null;
  form: { user?: string };
  isAdmin: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateMutation: { mutate: (args: { id: number; payload: any }) => void };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createMutation: { mutate: (payload: any) => void };
}

export const useHoursLogSubmit =
  <T extends { id: number }>({
    validateForm,
    buildPayload,
    editing,
    form,
    isAdmin,
    updateMutation,
    createMutation,
  }: UseHoursLogSubmitOptions<T>) =>
  // fallow-ignore-next-line complexity
  (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    const payload = buildPayload();
    if (editing) updateMutation.mutate({ id: editing.id, payload });
    else {
      const createPayload =
        form.user && isAdmin ? { ...payload, user: Number(form.user) } : payload;
      createMutation.mutate(createPayload);
    }
  };
