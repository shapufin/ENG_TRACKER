interface UseHoursLogQueryCallbacksOptions {
  setFormOpen: (v: boolean) => void;
  resetForm: () => void;
  setDeleteOpen: (v: boolean) => void;
  setDeletingId: (v: number | null) => void;
  setRejectOpen: (v: boolean) => void;
  setRejectingId: (v: number | null) => void;
  setRejectReason: (v: string) => void;
}

export const useHoursLogQueryCallbacks = ({
  setFormOpen,
  resetForm,
  setDeleteOpen,
  setDeletingId,
  setRejectOpen,
  setRejectingId,
  setRejectReason,
}: UseHoursLogQueryCallbacksOptions) => ({
  onCreateSuccess: () => {
    setFormOpen(false);
    resetForm();
  },
  onUpdateSuccess: () => {
    setFormOpen(false);
    resetForm();
  },
  onDeleteSuccess: () => {
    setDeleteOpen(false);
    setDeletingId(null);
  },
  onRejectSuccess: () => {
    setRejectOpen(false);
    setRejectingId(null);
    setRejectReason("");
  },
});
